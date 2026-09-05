import { Vibrator } from '@zos/sensor'

export class Melody {
    constructor(param) {
        this._notes = param?.notes ?? 'PPPPpDDCDCPCPDDCDCPCPDCPDDPCPpD';
        this._delay = param?.delay ?? 300;
        this._repeat = param?.repeat ?? 1;
        this._vibrator = param?.vibrator;
        this._timer = undefined;
        this._played = false;
    }

    start(param) {
        if (param?.notes) this._notes = param.notes;
        if (param?.delay) this._delay = param.delay;
        if (param?.repeat) this._repeat = param.repeat;
        this._lap = this._repeat;

        this.stop();

        this._played = true;
        if (!this._vibrator) {
            this._vibrator = new Vibrator();
        }
        this._index = 0;
        this._timer = setTimeout(this._play.bind(this), this._delay);
    }

    stop() {
        if (this._played) {
            this._played = false;
            if (this._timer) {
                clearTimeout(this._timer);
                this._timer = undefined;
            }
            this._vibrator.stop();
        }
    }

    get isPlaying() {
        return this._played;
    }

    _play() {
        if (this._index >= this._notes.length) {
            this._lap--;
            if (this._lap === 0) {
                this.stop();
                return;
            }
            this._index = 0;
        }

        const note = this._notes[this._index];
        this._index++;
        let delay = this._delay;

        switch (note) {
            case 'C':
                // тихий ударник
                this._vibrator.start({mode: 17});
                break;
            case 'D':
                // грубый ударник
                this._vibrator.start({mode: 18});
                break;
            case 'P':
                // пауза
                break;
            case 'p':
                // полупауза
                delay /= 2;
                break;
        }

        this._timer = setTimeout(this._play.bind(this), delay);
    }

}