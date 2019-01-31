const { EventEmitter } = require('events')
const { Writable, Duplex } = require('stream')
const { Multiplexer, encodeObject, decodeObject } = require('omnistreams')
const WebSocket = require('isomorphic-ws')

const MESSAGE_TYPE_CREATE_STREAM = 0
const MESSAGE_TYPE_MESSAGE = 1

class WhineryServer extends EventEmitter {
  constructor(options) {
    super()

    if (options.server) {
      this._server = new WebSocket.Server({ server: options.server })
    }
    else {
      this._server = new WebSocket.Server(options)
    }

    this._server.on('connection', (ws) => {

      console.log("New conn")

      const client = new WhineryClient(ws)
      this.emit('connection', client)
    })
  }
}

function BinaryServer(options) {
  return new WhineryServer(options)
}

class WhineryClient extends EventEmitter {
  constructor(socketOrString) {
    super()

    let ws
    if (typeof socketOrString === 'string') {
      ws = new WebSocket(socketOrString)
      this._nextStreamId = 0
    }
    else {
      ws = socketOrString
      this._nextStreamId = 1
    }

    this._streams = {}

    const mux = new Multiplexer()

    ws.binaryType = 'arraybuffer'

    mux.setSendHandler((message) => {
      ws.send(message)
    })

    ws.onmessage = (message) => {
      mux.handleMessage(message.data)
    }

    mux.onControlMessage((rawMessage) => {
      const message = decodeObject(rawMessage)
      console.log("Control message:")
      console.log(message)

      switch (message.type) {
        case MESSAGE_TYPE_CREATE_STREAM: {

          const streamId = message.streamId
          const metadata = message.metadata

          const consumer = this._mux.createConduit(encodeObject({
            streamId,
          }))

          const messageHandler = (event, message) => {
            mux.sendControlMessage(encodeObject({
              type: MESSAGE_TYPE_MESSAGE,
              streamId,
              event,
              message,
            }))
          }

          const stream = new WhineryStream(messageHandler)
          stream.setConsumer(consumer)
          //this._streams[streamId] = stream
          this.emit('stream', stream, metadata)
          break
        }
        case MESSAGE_TYPE_MESSAGE: {
          const streamId = message.streamId

          const stream = this.getStream(streamId)

          stream.handleMessage(message.event, message.message)

          break
        }
        default: {
          console.log("Invalid message type: " + message.type)
        }
      }
    })

    mux.onConduit((producer, rawMeta) => {
      const metadata = decodeObject(rawMeta)
      console.log("New conduit")
      console.log(metadata)
      const streamId = metadata.streamId

      const stream = this._streams[streamId]
      if (stream) {
        console.log("Connect stream: " + streamId)
        stream.setProducer(producer)
      }
      else {
        throw "Invalid stream id: " + streamId
      }
    })

    ws.onopen = () => {
      console.log("openses")
      this.emit('open')
    }

    this._mux = mux
  }

  getStream(streamId) {
    const stream = this._streams[streamId]

    if (!stream){
      throw "Invalid streamId: " + streamId
    }

    return stream
  }

  createStream(metadata) {
    const streamId = this._nextStreamId

    this._mux.sendControlMessage(encodeObject({
      type: MESSAGE_TYPE_CREATE_STREAM,
      streamId,
      metadata,
    }))

    this._nextStreamId += 2

    const messageHandler = (event, message) => {
      this._mux.sendControlMessage(encodeObject({
        type: MESSAGE_TYPE_MESSAGE,
        streamId,
        event,
        message,
      }))
    }

    const stream = new WhineryStream(messageHandler)
    this._streams[streamId] = stream

    return stream
  }
}

function BinaryClient(wsString) {
  return new WhineryClient(wsString)
}


class WhineryStream extends Writable {
  constructor(messageHandler) {
    super()

    this._messageHandler = messageHandler
  }

  message(event, msg) {
    this._messageHandler(event, msg) 
  }

  handleMessage(event, msg) {
    this.emit(event, msg)
  }

  setProducer(producer) {
    this._producer = producer

    producer.onData((data) => {
      this.emit('data', data)
    })

    producer.onEnd(() => {
      this.emit('end')
    })
  }

  setConsumer(consumer) {
    this._consumer = consumer
  }

  _write(chunk, encoding, callback) {
    // TODO: make sure backpressure is done properly
    this._consumer.write(chunk)
    callback(null)
  }
}

module.exports = {
  WhineryServer,
  WhineryClient,
  BinaryServer,
  BinaryClient,
}
