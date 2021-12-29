import {v4 as uuidv4} from 'uuid'
import {Stream} from 'stream'

/**
 * Class for sending stream with extra information
 */
class OctopusStream {
    _stream = null;
    _extra = {};
    _uuid = null;
    constructor(params) {
        //if params doesn't contain stream throw error
        if (!this.isReadableStream(params.stream)) {
            throw new Error("Not a readable stream");
        }
        this._stream = params.stream;
        this._extra = params.extra;
        this._uuid = (params.uuid)? params.uuid : uuidv4();
    }

    /**
     * Return extrea object
     * @returns object
     */
    extra() {
        return this._extra;
    }

    /**
     * Return stream
     * @returns stream
     */
    stream() {
        return this._stream;
    }

    /**
     * return uuid
     * @returns string
     */
    uuid() {
        return this._uuid
    }

    /**
     * Check if object is a readable stream
     * @param object obj 
     * @returns boolean
     */
    isReadableStream(obj) {
        return obj instanceof Stream &&
            typeof (obj._read === 'function') &&
            typeof (obj._readableState === 'object');
    }
}

export default OctopusStream