# Prepend this file's directory to the include path if it's not there already.
$:.unshift(File.dirname(File.expand_path(__FILE__)))
$:.uniq!

require 'find'
require 'pathname'
require 'set'
require 'osx/foundation'

OSX.require_framework '/System/Library/Frameworks/CoreServices.framework/Frameworks/CarbonCore.framework'

require 'synchrotron/ignore'
require 'synchrotron/logger'
require 'synchrotron/stream'
require 'synchrotron/version'

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
        '--human-readable',
        '--links',
        '--recursive',
        '--times',
        '--verbose'
      ],

      :rsync_path => '/usr/bin/rsync',
      :verbosity  => :info
    }.merge(config)

    @log       = Logger.new(@config[:verbosity])
    @ignore    = Ignore.new(@config[:exclude])
    @regex_rel = Regexp.new("^#{Regexp.escape(@config[:local_path].chomp('/'))}/?")

    @config[:rsync_options] << '--dry-run' if @config[:dry_run]

    local_exclude_file = File.join(@config[:local_path], '.synchrotron-exclude')
    @config[:exclude_from] << local_exclude_file if File.exist?(local_exclude_file)
    @config[:exclude_from].each {|filename| @ignore.add_file(filename) }

    @callback = proc do |stream, context, event_count, paths, marks, event_ids|
      changed = Set.new
      paths.regard_as('*')
      event_count.times {|i| changed.add(paths[i]) unless @ignore.match(paths[i]) }

      changed = coalesce_changes(changed)
      return if changed.empty?

      @log.info "Change detected"
      changed.each {|path| sync(path) }
    end

    @stream  = Stream.new(config[:local_path], @callback)

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
    @stream.start

    begin
      OSX.CFRunLoopRun()
    rescue Interrupt
      @stream.release
    end
  end

  def relative_path(path)
    path.sub(@regex_rel, '')
  end

  def sync(path = @config[:local_path])
    rsync_local   = escape_arg(path)
    rsync_options = @config[:rsync_options].join(' ')
    rsync_remote  = escape_arg(File.join(@config[:remote_path], relative_path(path)))

    # Build exclusion list.
    @config[:exclude].each {|p| rsync_options << " --exclude #{escape_arg(p)}" }
    @config[:exclude_from].each {|f| rsync_options << " --exclude-from #{escape_arg(f)}"}

    puts `#{@config[:rsync_path]} #{rsync_options} #{rsync_local} #{rsync_remote}`
    puts
  end

  private

  def escape_arg(str)
    "'#{str.gsub("'", "\\'")}'"
  end

end; end
