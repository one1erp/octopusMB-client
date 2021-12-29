import {v4 as uuidv4} from 'uuid'

/**
 * Class for sending stream with extra information
 */
class OctopusStream {
    _stream = null;
    _extra = {};
    _uuid = null;
    constructor(params) {
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
}

export default OctopusStream