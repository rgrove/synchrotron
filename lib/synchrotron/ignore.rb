module Synchrotron; class Ignore

  GLOB_PATTERNS = {'*' => '.*', '?' => '.'}
  REGEX_COMMENT = /#.*$/
  REGEX_REGEX   = /^\s*(%r(.).*\2[imxouesn]*)\s*$/i

  def initialize(list = [])
    @cache    = {}
    @globs    = []
    @regexes  = []

    @list     = list.to_a
    @log      = Synchrotron.log

    compile(@list)
  end

  def add(list)
    compile(list.to_a)
  end

  def add_file(filename)
    File.open(filename, 'r') {|f| compile(f.readlines) }
  end

  def match(path)
    _path = Synchrotron.relative_path(path.strip)

    return @cache[_path] if @cache.has_key?(_path)

    @cache[_path] = match = @globs.any? {|glob| _path =~ glob } ||
        @regexes.any? {|regex| _path =~ regex }

    @log.insane "Ignoring #{_path}" if match
    match
  end

  private

  def compile(list)
    globs   = []
    regexes = []
    lineno  = 0

    list.each do |line|
      lineno += 1

      # Strip comments.
      line.sub!(REGEX_COMMENT, '')
      line.strip!

      # Skip empty lines.
      next if line.empty?

      if line =~ REGEX_REGEX
        regexes << Thread.start { $SAFE = 4; eval($1) }.value
      else
        globs << glob_to_regex(line)
      end
    end

    @cache    = {}
    @globs   += globs
    @regexes += regexes
  end

  def glob_to_regex(str)
    regex = str.gsub(/(.)/) {|c| GLOB_PATTERNS[$1] || Regexp.escape(c) }
    Regexp.new("#{regex}$")
  end

end; end
