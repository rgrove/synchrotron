module Synchrotron; class Stream

  def initialize(paths, callback, since = OSX::KFSEventStreamEventIdSinceNow)
    @log     = Synchrotron.log
    @started = false
    @stream  = OSX.FSEventStreamCreate(nil, callback, nil, paths.to_a, since, 0.5, 0)

    raise "failed to create FSEventStream" unless check_stream

    OSX.FSEventStreamScheduleWithRunLoop(@stream, OSX.CFRunLoopGetCurrent(),
        OSX::KCFRunLoopDefaultMode)
  end

  def release
    stop
    OSX.FSEventStreamInvalidate(@stream)
    OSX.FSEventStreamRelease(@stream)

    @log.debug "FSEventStream released"
  end

  def start
    return if @started
    raise "failed to start FSEventStream" unless OSX.FSEventStreamStart(@stream)
    @started = true

    @log.debug "FSEventStream started"
  end

  def stop
    return unless @started
    OSX.FSEventStreamStop(@stream)
    @started = false

    @log.debug "FSEventStream stopped"
  end

  private

  def check_stream
    !!@stream
  end

end; end
