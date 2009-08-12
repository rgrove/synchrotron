# Not currently used.

module Synchrotron; class Scanner
  attr_reader :paths, :root

  def initialize(root)
    @paths = {}
    @root  = File.expand_path(root)
  end

  def scan(path = @root)
    changed = {}
    ignored = []

    Find.find(path) do |p|
      if Synchrotron.ignore.match(p)
        ignored << p
        Find.prune
      end

      old  = @paths[p]
      stat = File.lstat(p)

      changed[p] = stat if old.nil? || stat.ino != old.ino ||
          stat.mtime != old.mtime || stat.size != old.size
    end

    @paths.merge!(changed) unless changed.empty?
    {:changed => changed.values.sort, :ignored => ignored}
  end

end; end
