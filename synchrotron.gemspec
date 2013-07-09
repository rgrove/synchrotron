require './lib/synchrotron/version'

Gem::Specification.new do |s|
  s.name     = 'synchrotron'
  s.summary  = 'Synchrotron monitors a local directory tree and performs ' <<
               'nearly instantaneous one-way synchronization of changes to ' <<
               'a remote directory using rsync.'
  s.version  = "#{Synchrotron::APP_VERSION}"
  s.authors  = ['Ryan Grove']
  s.email    = 'ryan@wonko.com'
  s.homepage = "#{Synchrotron::APP_URL}"

  s.platform = Gem::Platform::RUBY
  s.required_ruby_version = Gem::Requirement.new('>= 1.8.7')
  s.required_rubygems_version = Gem::Requirement.new('>= 1.2.0')

  # Runtime dependencies.
  s.add_dependency('rb-fsevent', '~> 0.9.3')
  s.add_dependency('terminal-notifier', '~> 1.4.2')
  s.add_dependency('trollop', '~> 1.13')

  s.require_paths = ['lib']
  s.executables   = ['synchrotron']

  s.files = [
    'bin/synchrotron'
  ] + Dir.glob('lib/**/*.rb')
end
