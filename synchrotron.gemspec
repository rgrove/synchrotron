# -*- encoding: utf-8 -*-

Gem::Specification.new do |s|
  s.name = %q{synchrotron}
  s.version = "0.0.1"

  s.required_rubygems_version = Gem::Requirement.new(">= 0") if s.respond_to? :required_rubygems_version=
  s.authors = ["Ryan Grove"]
  s.date = %q{2009-08-11}
  s.default_executable = %q{synchrotron}
  s.email = %q{ryan@wonko.com}
  s.executables = ["synchrotron"]
  s.files = ["bin/synchrotron", "lib/synchrotron.rb", "lib/synchrotron/ignore.rb", "lib/synchrotron/logger.rb", "lib/synchrotron/scanner.rb", "lib/synchrotron/stream.rb", "lib/synchrotron/version.rb"]
  s.homepage = %q{http://github.com/rgrove/synchrotron/}
  s.require_paths = ["lib"]
  s.required_ruby_version = Gem::Requirement.new(">= 1.8.6")
  s.rubygems_version = %q{1.3.2}
  s.summary = %q{Synchrotron monitors a local directory tree and performs nearly instantaneous one-way synchronization of changes to a remote directory.}

  if s.respond_to? :specification_version then
    current_version = Gem::Specification::CURRENT_SPECIFICATION_VERSION
    s.specification_version = 3

    if Gem::Version.new(Gem::RubyGemsVersion) >= Gem::Version.new('1.2.0') then
      s.add_runtime_dependency(%q<trollop>, ["~> 1.13"])
    else
      s.add_dependency(%q<trollop>, ["~> 1.13"])
    end
  else
    s.add_dependency(%q<trollop>, ["~> 1.13"])
  end
end
