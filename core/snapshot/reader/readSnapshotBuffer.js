import Binary from '../../binary/Binary.js';
import BitBuffer from '../../binary/BitBuffer.js';
import BitStream from '../../binary/BitStream.js';
import readBatches from './readBatches.js';
import readSingleProps from './readSingleProps.js';
import readCreateEntities from './readCreateEntities.js';
import readDeleteEntities from './readDeleteEntities.js';
import readLocalEvents from './readLocalEvents.js';
import readMessages from './readMessages.js';
import readJSONs from './readJSONs.js';
import readTimesync from './readTimesync.js';
import readPing from './readPing.js';
import readTransfer from './readTransfer.js';
import readConnectionResponse from './readConnectionResponse.js';
import readEngineMessages from './readEngineMessages.js';

//var config = require('../../../config')

import { Chunk } from '../Chunk.js';

import { ChunkReverse } from '../Chunk.js';


function readSnapshotBuffer(arrayBuffer, protocols, config, connectCallback, transferCallback, protocolResolver) {
    var bitBuffer = new BitBuffer(arrayBuffer)
    var bitStream = new BitStream(bitBuffer)

    //console.log(bitStream)

    var snapshot = {
        tick: 0,
        clientTick: -1,

        timestamp: -1,
        pingKey: -1,
        avgLatency: -1,


        engineMessages: [],


        // a copy of all visible events
        localMessages: [],

        // a copy of all messages
        messages: [],

        jsons: [],

        // a copy of all visible entities
        createEntities: [],

        // ids of entites no longer relevant to client
        deleteEntities: [],

        // updates to individual entities, using varying optimizations
        updateEntities: {
            // not used
            full: [],
            // per-property updates
            partial: [],
            // microOptimizations
            optimized: []
        },

        createComponents: [],
        deleteComponents: [],

        updateComponents: {
            // not used
            full: [],
            // per-property updates
            partial: [],
            // microOptimizations
            optimized: []
        }

    }

    //var timestamp = bitStream.readFloat64()
    //console.log(Date.now() - timestamp)
    //snapshot.timestamp = timestamp
    //snapshot.clientTick = bitStream.readUInt32()

    //console.log('+==================================+')
    while (bitStream.offset + 16 <= bitBuffer.bitLength) {
        //console.log('while', bitStream.offset, bitBuffer.bitLength)
        var msgType = bitStream.readUInt8()
        //console.log(msgType, ChunkReverse[msgType])

        switch (msgType) {
            case Chunk.Engine: 
                var engineMessages = readEngineMessages(bitStream, protocols, config)
                snapshot.engineMessages = engineMessages
                break
            case Chunk.ClientTick:
                snapshot.clientTick = bitStream.readUInt32()
                break
            case Chunk.Ping:
                var pingKey = readPing(bitStream)
                snapshot.pingKey = pingKey
                break
            case Chunk.Timesync:
                var times = readTimesync(bitStream)
                //console.log('READ Timesync', times)
                snapshot.timestamp = times.time
                snapshot.avgLatency = times.avgLatency
                break
            case Chunk.CreateEntities:
                var entities = readMessages(bitStream, protocols, config)
                //console.log('READ ENTITIES', entities)
                snapshot.createEntities = entities
                break
            case Chunk.UpdateEntitiesPartial:
                var singleProps = readSingleProps(bitStream, protocolResolver, config)
                //console.log('SINGLE PROPS', singleProps)
                snapshot.updateEntities.partial = singleProps
                break
            case Chunk.UpdateEntitiesOptimized:
                var batches = readBatches(bitStream, protocolResolver)
                //console.log('BATCHES', batches)
                snapshot.updateEntities.optimized = batches
                break
            case Chunk.DeleteEntities:
                var deleteEntities = readDeleteEntities(bitStream, config)
                //console.log('DeleteEntities', deleteEntities)
                snapshot.deleteEntities = deleteEntities
                break
            case Chunk.LocalEvents:
                //console.log('prot', protocols)
                var localEvents = readMessages(bitStream, protocols, config)
                snapshot.localMessages = localEvents
                break
            case Chunk.Messages:
                var messages = readMessages(bitStream, protocols, config)
                snapshot.messages = messages
                break
            case Chunk.JSONs:
                var jsons = readJSONs(bitStream)
                snapshot.jsons = jsons
                break
            case Chunk.ConnectionResponse: 
                var response = readConnectionResponse(bitStream)
                connectCallback(response)
                return // exit this code! not a normal snapshot
            default:
                break
        }
    }
    //console.log('ss',snapshot)
   // entityCache.saveSnapshot(snapshot)
    
    return snapshot //simplifySnapshot(snapshot, entityCache)
    

}

export default readSnapshotBuffer;