require 'rubygems'
require 'rake/clean'
require 'rake/gempackagetask'
require 'rake/rdoctask'

$:.unshift(File.join(File.dirname(File.expand_path(__FILE__)), 'lib'))
$:.uniq!

require 'synchrotron/version'

gemspec = Gem::Specification.new do |s|
  s.name     = 'synchrotron'
  s.summary  = 'Synchrotron monitors a local directory tree and performs ' <<
               'nearly instantaneous one-way synchronization of changes to ' <<
               'a remote directory.'
  s.version  = "#{Synchrotron::APP_VERSION}"
  s.author   = "#{Synchrotron::APP_AUTHOR}"
  s.email    = "#{Synchrotron::APP_EMAIL}"
  s.homepage = "#{Synchrotron::APP_URL}"
  s.platform = Gem::Platform::RUBY

  s.executables           = ['synchrotron']
  s.require_path          = 'lib'
  s.required_ruby_version = '>= 1.8.6'

  s.add_dependency('trollop', '~> 1.13')

  s.files = [
    'bin/synchrotron',
    'lib/synchrotron.rb',
    'lib/synchrotron/ignore.rb',
    'lib/synchrotron/logger.rb',
    'lib/synchrotron/scanner.rb',
    'lib/synchrotron/stream.rb',
    'lib/synchrotron/version.rb'
  ]
end

Rake::GemPackageTask.new(gemspec) do |p|
  p.need_tar = false
  p.need_zip = false
end

Rake::RDocTask.new do |rd|
  rd.main     = 'README.rdoc'
  rd.title    = 'Synchrotron Documentation'
  rd.rdoc_dir = 'doc'

  rd.rdoc_files.include('README.rdoc', 'lib/**/*.rb')

  rd.options << '--line-numbers' << '--inline-source'
end

desc 'Generate an updated gemspec'
task :gemspec do
  file = File.dirname(__FILE__) + "/#{gemspec.name}.gemspec"
  File.open(file, 'w') {|f| f << gemspec.to_ruby }
  puts "Created gemspec: #{file}"
end
