import * as hmUI from '@zos/ui'
import * as hmSensor from '@zos/sensor'
import * as hmBle from '@zos/ble'
import { getSystemMode } from '@zos/settings'

import Layout from './aod.layout.js'
import { Config } from '../classes/config'
import { Barometer2 } from '../classes/barometer2'
import { HeartAnim } from '../classes/heartanim'

const STEP_SEC = 216; // интервал опроса барометра (сек)

const R = 240;
const W = 340;
const H = 100;
const MARGIN = 20;
const Y_MIN = 84;
const Y_MAX = 190;

const Y_DIFF = Y_MAX - Y_MIN;
const R2 = R * R;
const M_MIN = R + MARGIN;
const M_MAX = R - W - MARGIN;
const MIRROR = 480 - H;

export default class AODScene {

    constructor() {
        console.log('AOD init');

        this.config = new Config();
        this.energySaving = this.config.getItem('energySaving', false); // режим экономии энергии
        this.aodMode = this.config.getItem('aodMode', 0);
        if (!this.energySaving) {
            this.leaveSignals = true;
        } else {
            this.leaveSignals = this.config.getItem('leaveSignals', false); // оставить сигналы
        }

        if (this.leaveSignals) {
            this.pulseVibra = !this.energySaving && this.config.getItem('pulseVibra', true);
            this.hourlyVibra = this.config.getItem('hourlyVibra', true);
            this.kmVibra = this.config.getItem('kmVibra', false);
            this.connectVibra = this.config.getItem('connectVibra', true);
            if (hmSensor.checkSensor(hmSensor.Buzzer)) {
                this.pulseBuzzer = !this.energySaving && this.config.getItem('pulseBuzzer', true);
                this.hourlyBuzzer = this.config.getItem('hourlyBuzzer', true);
                this.kmBuzzer = this.config.getItem('kmBuzzer', false);
                this.connectBuzzer = this.config.getItem('connectBuzzer', true);
            } else {
                this.pulseBuzzer = false;
                this.hourlyBuzzer = false;
                this.kmBuzzer = false;
                this.connectBuzzer = false;
            }
            this.pulseAlarm = this.pulseVibra || this.pulseBuzzer; // сигнал тревоги при превышении макс. пульса
            this.hourlyAlarm = this.hourlyVibra || this.hourlyBuzzer; // ежечасный сигнал
            this.kmAlarm = this.kmVibra || this.kmBuzzer; // сигнал каждого км
            this.connectAlarm = this.connectVibra || this.connectBuzzer; // сигнал разрыва связи
            this.hourlyNightOff = this.config.getItem('hourlyNightOff', false);

            this.hourHandler = () => this.hourly();
            this.connectHandler = (status) => this.connect(status);

            this.perHour = false;
            this.vibrator = null;
            this.buzzer = null;
            this.melody = null;
            this._bleListening = false;
        } else {
            this.pulseAlarm = false;
            this.hourlyAlarm = false;
            this.kmAlarm = false;
            this.connectAlarm = false;
        }
    }

    build() {
        console.log('AOD build');

        // Задник
        if (this.pulseAlarm) {
            this.bg_heart_alarm = hmUI.createWidget(hmUI.widget.IMG, Layout.background.heart_alarm);
            this.bg_heart_alarm.setProperty(hmUI.prop.VISIBLE, false);
        }

        if (this.aodMode === 0 || this.aodMode === 1) {
            // Время
            this.time_clock = hmUI.createWidget(hmUI.widget.IMG_TIME, Layout.time.clock);

            // Режимы AOD
            switch (this.aodMode) {
                case 0: // Скринсейвер (часы)
                    this.isTopHalf = true;
                    this.period = this.energySaving ? 600000 : 300000;
                    this.timeout = setTimeout(this.newPosition.bind(this), this.energySaving ? 120000 : 60000);
                    break;
                case 1: // Затухание
                    // Таймер начала затухания времени
                    this.timeout = setTimeout(this.fadeOut.bind(this), 7000);
                    break;
            }
        }

        // Ежечасный сигнал
        if (this.hourlyAlarm) {
            this.timeSensor = new hmSensor.Time();
            this.onPerHour();
        }

        // Сигнал на каждый км
        if (this.kmAlarm) {
            this.distanceHandler = () => this.updateDistance();
            this.distance = new hmSensor.Distance();
            this.km = Math.floor(this.distance.getCurrent() / 1000);
            this.distance.onChange(this.distanceHandler);
        }

        // Сигнал разрыва связи
        if (this.connectAlarm) {
            this.connectTimeout = setTimeout(() => {
                this.connectTimeout = null;
                this._bleListening = true;
                hmBle.addListener(this.connectHandler);
            }, 1000);
        }

        if (!this.energySaving) {
            // Сохранение показаний барометра и высотомера
            this.barometer2 = new Barometer2();
            this.updateBarometer();

            // Отслеживание тревоги по чрезмерному пульсу
            if (this.pulseAlarm) {
                this.pulseAlarmInitTimeout = setTimeout(this.pulseAlarmInit.bind(this), 1000);
            }
        }

    }

    resume() {
        console.log('AOD resume');
    }

    onDestroy() {
        console.log('AOD destroy');

        if (this.interval) clearInterval(this.interval);
        if (this.timeout) clearTimeout(this.timeout);
        if (this.barometerTimer) clearTimeout(this.barometerTimer);
        if (this.pulseAlarmInitTimeout) clearTimeout(this.pulseAlarmInitTimeout);
        if (this.connectTimeout) clearTimeout(this.connectTimeout);

        if (this.pulseAlarm) {
            this.heartAnim?.stop();
            this.alarmOff();
        }

        // Ежечасный сигнал
        this.offPerHour();

        // Сигнал на каждый км
        if (this.kmAlarm) {
            this.distance.offChange(this.distanceHandler);
        }

        // Сигнал разрыва связи
        if (this.connectAlarm && this._bleListening) {
            hmBle.removeListener(this.connectHandler);
        }
    }

    // Считывание данных с барометра
    updateBarometer() {
        this.barometer2.update();
        const now = new Date();
        const secFromMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        const passed = secFromMidnight % STEP_SEC;
        const waitSec = STEP_SEC - passed;
        const delay = (waitSec + 1) * 1000;
        this.barometerTimer = setTimeout(this.updateBarometer.bind(this), delay);
    }

    newPosition() {
        // Флаг половины экрана
        this.isTopHalf = !this.isTopHalf;

        let y = Y_MIN + Math.random() * Y_DIFF;

        // Горизонтальные границы по кругу
        const dx = Math.sqrt(R2 - (y - R) * (y - R));
        let xMin = M_MIN - dx;
        let xMax = M_MAX + dx;

        let x = xMin + Math.random() * (xMax - xMin);

        if (!this.isTopHalf) {
            y = MIRROR - y; // зеркалим на нижнюю половину
        }

        // Пересоздания виджета
        hmUI.deleteWidget(this.time_clock);
        this.time_clock = hmUI.createWidget(hmUI.widget.IMG_TIME, {
            ...Layout.time.clock,
            hour_startX: x,
            hour_startY: y,
            minute_startX: x + 191,
            minute_startY: y,
        });

        this.timeout = setTimeout(this.newPosition.bind(this), this.period);
    }

    fadeOut() {
        this.timeout = null;
        this.alpha = this.energySaving ? 0 : 250;
        this.interval = setInterval(() => {
            if (this.alpha > 30) {
                this.time_clock.setAlpha(this.alpha);
                solidRedraw();
                this.alpha -= 10;
            } else {
                clearInterval(this.interval);
                this.interval = null;
                hmUI.deleteWidget(this.time_clock);
                if (solidRedraw.textWidget) hmUI.deleteWidget(solidRedraw.textWidget);
                solidRedraw.textWidget = undefined;
            }
        }, 1000);
    }

    pulseAlarmInit() {
        this.pulseAlarmInitTimeout = null;
        this.heartAnim = new HeartAnim({
            anim: false,
            alarm_on_func: () => this.alarmOn(),
            alarm_off_func: () => this.alarmOff(),
        });
        this.heartAnim.update();
        this.heartAnim.start();
    }

    alarmOn() {
        this.bg_heart_alarm?.setProperty(hmUI.prop.VISIBLE, true);

        const mode = getSystemMode();
        if (mode.DND) return; // режим "Не беспокоить"

        if (this.pulseVibra) {
            this.checkVibrator();
            this.vibrator.start({ mode: hmSensor.VIBRATOR_SCENE_STRONG_REMINDER });
        }

        if (mode.theater) return; // режим "Театр"

        if (this.pulseBuzzer) {
            this.checkBuzzer();
            this.buzzer.start(5, -1);
        }
    }

    alarmOff() {
        this.bg_heart_alarm?.setProperty(hmUI.prop.VISIBLE, false);

        if (this.pulseVibra) {
            this.vibrator?.stop();
        }

        if (this.pulseBuzzer) {
            this.buzzer?.stop();
        }
    }

    onPerHour() {
        if (!this.perHour) {
            this.timeSensor.onPerHourEnd(this.hourHandler);
            this.perHour = true;
        }
    }

    offPerHour() {
        if (this.perHour) {
            this.timeSensor.offPerHourEnd(this.hourHandler);
            this.perHour = false;
        }
    }

    hourly() {
        // Ночью выкл
        if (this.hourlyNightOff) {
            const hours = new Date().getHours();
            if (hours >= 22 || hours <= 7) return;
        }

        const mode = getSystemMode();
        if (mode.DND) return; // режим "Не беспокоить"

        // Если тревога по макс пульсу - остановить
        if (this.pulseAlarm) {
            this.heartAnim?.clearAlarm();
        }

        // Вибрация
        if (this.hourlyVibra) {
            this.checkVibrator();
            this.vibratorNotification();
        }

        if (mode.theater) return; // режим "Театр"

        // Зуммер
        if (this.hourlyBuzzer) {
            this.checkBuzzer();
            this.buzzer.start(3);
        }
    }

    // Сигнал на каждый километр
    updateDistance() {
        const current = this.distance.getCurrent();
        const km = Math.floor(current / 1000);

        if (km !== this.km) {
            if (km > this.km && current % 1000 < 95) this.kmPassed();
            this.km = km;
        }
    }

    kmPassed() {
        const mode = getSystemMode();
        if (mode.DND) return; // режим "Не беспокоить"

        // Если тревога по макс пульсу - остановить
        if (this.pulseAlarm) {
            this.heartAnim.clearAlarm();
        }

        // Вибрация
        if (this.kmVibra) {
            this.checkVibrator();
            this.vibrator.start([
                { type: this.vibratorTypes.CONTINUOUS, duration: 300 },
                { type: this.vibratorTypes.PAUSE, duration: 10 },
                { type: this.vibratorTypes.CONTINUOUS, duration: 300 },
                { type: this.vibratorTypes.PAUSE, duration: 10 },
                { type: this.vibratorTypes.CONTINUOUS, duration: 300 },
                { type: this.vibratorTypes.PAUSE, duration: 10 },
            ]);
        }

        if (mode.theater) return; // режим "Театр"

        // Зуммер
        if (this.kmBuzzer) {
            this.checkBuzzer();
            this.buzzer.start(4, 2);
        }
    }

    connect(status) {
        const mode = getSystemMode();
        if (mode.DND) return; // режим "Не беспокоить"

        // Если тревога по макс пульсу - остановить
        if (this.pulseAlarm) {
            this.heartAnim.clearAlarm();
        }

        // Вибрация
        if (this.connectVibra) {
            this.checkVibrator();
            this.vibratorNotification();
        }

        if (mode.theater) return; // режим "Театр"

        // Зуммер
        if (this.connectBuzzer) {
            this.checkBuzzer();
            this.buzzer.start(status ? 5 : 6);
        }
    }

    checkVibrator() {
        if (!this.vibrator) {
            this.vibrator = new hmSensor.Vibrator();
            this.vibratorTypes = this.vibrator.getType();
        }
    }

    checkBuzzer() {
        if (!this.buzzer) {
            this.buzzer = new hmSensor.Buzzer();
        }
    }

    vibratorNotification() {
        this.vibrator.start([
            { type: this.vibratorTypes.CONTINUOUS, duration: 30 },
            { type: this.vibratorTypes.PAUSE, duration: 5 },
            { type: this.vibratorTypes.CONTINUOUS, duration: 150 },
        ]);
    }

}

// Костыль для перерисовки экрана
function solidRedraw() {
    if (solidRedraw.textWidget === undefined) {
        solidRedraw.textWidget = hmUI.createWidget(hmUI.widget.TEXT, {
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            text: '',
        });
        solidRedraw.val = 0;
    }
    solidRedraw.textWidget.setAlpha(solidRedraw.val);
    solidRedraw.val = 1 - solidRedraw.val;
}
