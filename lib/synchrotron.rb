require 'find'
require 'pathname'
require 'rb-fsevent'
require 'thread'

require_relative 'synchrotron/ignore'
require_relative 'synchrotron/logger'
require_relative 'synchrotron/stream'
require_relative 'synchrotron/version'

module Synchrotron; class << self
  attr_reader :config, :ignore, :log, :scanner

  def init(config = {})
    @config = {
      :dry_run      => false,
      :exclude      => [],
      :exclude_from => [],
      :local_path   => File.expand_path('.'),
      :remote_path  => nil,

      :rsync_options => [
        '--compress',
        '--delete',
        '--human-readable',
        '--links',
        '--out-format="--> [%o] %n %L"',
        '--perms',
        '--recursive',
        '--times'
      ],

      :rsync_path => '/usr/bin/rsync',
      :verbosity  => :info
    }.merge(config)

    @log       = Logger.new(@config[:verbosity])
    @ignore    = Ignore.new(@config[:exclude], @log)
    @regex_rel = Regexp.new("^#{Regexp.escape(@config[:local_path].chomp('/'))}/?")
    @queue     = Queue.new

    @config[:rsync_options] << '--dry-run' if @config[:dry_run]

    local_exclude_file = File.join(@config[:local_path], '.synchrotron-exclude')
    @config[:exclude_from] << local_exclude_file if File.exist?(local_exclude_file)
    @config[:exclude_from].each {|filename| @ignore.add_file(filename) }

    @log.info "Local path : #{@config[:local_path]}"
    @log.info "Remote path: #{@config[:remote_path]}"
  end

  def coalesce_changes(changes)
    coalesced = {}

    changes.each do |path|
      next if coalesced.include?(path)

      pn = Pathname.new(path)

      coalesced[pn.to_s] = true unless catch :matched do
        pn.descend {|p| throw(:matched, true) if coalesced.include?(p.to_s) }
        false
      end
    end

    coalesced.keys.sort
  end

  def monitor
    @log.info "Watching for changes"

    @sync_thread = Thread.new do
      while changed = @queue.pop do
        @log.verbose "Change detected"

        changed.each {|path| @log.verbose "--> #{path}" }
        changed.each {|path| sync(path) if File.exist?(path) }
      end
    end

    fsevent = FSEvent.new
    fsevent.watch(@config[:local_path], {:latency => 1}) do |paths|
      changed = coalesce_changes(paths.reject {|path| @ignore.match(path) })
      @queue << changed unless changed.empty?
    end

    fsevent.run
  end

  def relative_path(path)
    path.sub(@regex_rel, '')
  end

  def sync(path = @config[:local_path])
    rsync_local   = escape_arg(path)
    rsync_options = @config[:rsync_options].join(' ')
    rsync_remote  = escape_arg(File.join(@config[:remote_path], relative_path(path)))

    if rsync_remote.include?('GIT_BRANCH')
      git_branch = `git symbolic-ref HEAD`[/([^\/])*$/].chomp
      @log.info "git branch is '#{git_branch}'."
      rsync_remote.gsub!('GIT_BRANCH',git_branch)
    end

    # Build exclusion list.
    @config[:exclude].each {|p| rsync_options << " --exclude #{escape_arg(p)}" }
    @config[:exclude_from].each {|f| rsync_options << " --exclude-from #{escape_arg(f)}"}

    rsync_cmd = "#{@config[:rsync_path]} #{rsync_options} #{rsync_local} #{rsync_remote}"

    @log.debug rsync_cmd

    lines = 0
    `#{rsync_cmd}`.each_line {|line| @log.info line; lines = lines + 1 }

    if @config[:notify] && lines > 0
      require 'terminal-notifier'

      TerminalNotifier.notify("Synced #{lines} files to #{rsync_remote}",
          :title  => 'Synchrotron',
          :sender => 'com.apple.Terminal',
          :group  => Process.pid)
    end
  end

  private

  def escape_arg(str)
    "'#{str.gsub("'", "\\'")}'"
  end

end; end
