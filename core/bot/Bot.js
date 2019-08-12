import ProtocolMap from '../protocol/ProtocolMap.js';
import metaConfig from '../common/metaConfig.js';
import createHandshakeBuffer from '../snapshot/writer/createHandshakeBuffer.js';
import readSnapshotBuffer from '../snapshot/reader/readSnapshotBuffer.js';
import EntityCache from '../instance/EntityCache.js';
import WorldState from '../client//WorldState.js';
import Interpolator from '../client//Interpolator.js';
import createPongBuffer from '../snapshot/writer/createPongBuffer.js';
import Chronus from '../client/Chronus.js';
import Outbound from '../client/Outbound.js';

//const W3CWebSocket = require('websocket').w3cwebsocket
//const WebSocket = require('ws')
import { default as cws } from '@clusterws/cws';

class Bot {
    constructor(config, protocols) {
        this.config = config
        this.protocols = protocols

        this.connectionOpen = null
        this.connectionClose = null
        this.websocket = null

        this.outbound = new Outbound(this.protocols, this.websocket, this.config)
        this.chronus = new Chronus()

        this.entityCache = new EntityCache(this.config)
        this.interp = new Interpolator(this.config)

        this.snapshots = []
        this.latestWorldState = null
        this.serverTick = 0
        this.tickLength = 1000 / config.UPDATE_RATE

        this.cr = []
        this.up = []
        this.de = []

        this.totalBytesReceived = 0


        this.averagePing = 100
        this.pings = []
    }

    connect(address, handshake) {
        this.websocket = new cws.WebSocket(address) //, 'nengi-protocol')
        this.outbound.websocket = this.websocket
        this.websocket.binaryType = 'arraybuffer'

        if (typeof handshake === 'undefined' || !handshake) {
            handshake = {}
        }

        this.websocket.on('open', event => {
            this.websocket.send(createHandshakeBuffer(handshake).byteArray)
        })

        this.websocket.on('error', err => {
            console.log('WebSocket error', err)
        })

        this.websocket.on('close', () => {
            if (this.connectionClose) {
                this.connectionClose()
            }
        })

        this.websocket.on('message', message => {
            //if (message.data instanceof ArrayBuffer) {
                // add this!
                this.totalBytesReceived += message.byteLength

                let snapshot = readSnapshotBuffer(
                    message,
                    this.protocols,
                    this.config,
                    this.connectionOpen,
                    this.transferCallback,
                    (id) => {
                        return this.entityCache.getEntity(id).protocol
                    }
                )
                // some messages aren't snapshots (connection & transfer)
                if (!snapshot) {
                    return
                }

                /* ping */
                if (snapshot.pingKey !== -1) {
                    var pongBuffer = createPongBuffer(snapshot.pingKey)
                    this.websocket.send(pongBuffer.byteArray)
                }
                if (snapshot.avgLatency !== -1) {
                    this.averagePing = snapshot.avgLatency
                }
                /* end ping */

                snapshot.createEntities.forEach(entity => {
                    this.entityCache.saveEntity(entity, entity.protocol)
                    this.cr.push(entity)
                })
                snapshot.updateEntities.partial.forEach(update => {
                    this.entityCache.updateEntityPartial(update.id, update.path, update.value)
                    this.up.push(update)
                })

                snapshot.deleteEntities.forEach(id => {
                    this.entityCache.deleteEntity(id)
                    this.de.push(id)
                })



                //console.log('snapshot', this.averagePing, this.avgDiff, snapshot.createEntities.length, snapshot.updateEntities.partial.length, snapshot.deleteEntities.length)

                let worldState = new WorldState(this.serverTick, this.tickLength, snapshot, this.latestWorldState, this.config)

                this.chronus.register(worldState.timestamp)

                this.latestWorldState = worldState
                // TODO unconfirmed commands


                this.snapshots.push(worldState)
                this.serverTick++
                //this.messages = this.messages.concat(snapshot.messages)
                //this.localMessages = this.localMessages.concat(snapshot.localMessages)
                // this.jsons = this.jsons.concat(snapshot.jsons)

            //} else if (typeof message.data === 'string') {
           //    console.log('received string data from server, ignoring')
            //} else {
            //    console.log('unknown websocket data type', message)
           // }
        })
    }

    readNetwork() {
        let obj = {
            latest: [],
            messages: [],
            localMessages: [],
            jsons: [],
            entities: [{
                createEntities: this.cr,
                updateEntities: this.up,
                deleteEntities: this.de
            }]
        }

        this.cr = []
        this.up = []
        this.de = []


        if (this.snapshots[this.snapshots.length - 20]) {
            //if (this.snapshots[this.snapshots.length - 20].processed) {
                this.snapshots.splice(this.snapshots.length - 20, 1)
            //}
        }
        /*

        if (this.snapshots[this.snapshots.length - 20]) {
            //if (this.snapshots[this.snapshots.length-20].processed) {
            this.snapshots.splice(this.snapshots.length - 20, 1)
            // }
        }
        */

        //console.log('sn', this.snapshots.length)
        //return this.interp.interp(this.snapshots, Date.now() - 100 - this.chronus.averageTimeDifference)

        return obj

    }

    getUnconfirmedCommands() {
        return this.outbound.getUnconfirmedCommands()
    }

    onConnect(cb) {
        this.connectionOpen = cb
    }

    onClose(cb) {
        this.connectionClose = cb
    }

    update() {
        this.outbound.update()
        this.outbound.unconfirmedCommands.clear()
    }

    addCommand(command) {
        this.outbound.addCommand(command)
    }
}

export default Bot;