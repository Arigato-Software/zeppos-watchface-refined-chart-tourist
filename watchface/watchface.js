import * as hmUI from '@zos/ui'
import * as hmSensor from '@zos/sensor'
import * as Router from '@zos/router'
import * as hmBle from '@zos/ble'
import { getSystemMode } from '@zos/settings'

import Layout from './watchface.layout.js'
import { Progress } from '../classes/progress'
import { HeartAnim } from '../classes/heartanim'
import { Altitude } from '../classes/altitude'
import { Barometer } from '../classes/barometer'
import { Config } from '../classes/config'
import { Melody } from '../classes/melody'

import { Barometer2, MODE as BAR_MODE, PERIOD } from '../classes/barometer2'

const RAD = Math.PI / 180;

export default class WatchFaceScene {

    constructor() {
        console.log('Watchface init');

        this.config = new Config();

        this.energySaving = this.config.getItem('energySaving', false); // режим экономии энергии
        if (this.energySaving) {
            this.leaveSignals = this.config.getItem('leaveSignals', false); // оставить сигналы
            this.compassMode = 0;
            this.targetMode = false;
            this.graphMode = 0;
        } else {
            this.leaveSignals = true;
            this.compassMode = this.config.getItem('compassMode', 0); // 0 - нет компаса
            this.targetMode = this.config.getItem('targetEnabled', false); // маркер направления
            this.graphMode = this.config.getItem('graphsMode', 1); // 1 - сутки

            this.minuteHandler = () => this.graphTime();
            this.changeCompassHandler = () => this.changeCompass();

            this._compassStarted = false;

            // Режим атм. давления: 0 - абсолютное, 1 - приведенное
            this.pressureMode = this.config.getItem('pressureMode', 1);
        }

        if (this.leaveSignals) {
            this.pulseVibra = !this.energySaving && this.config.getItem('pulseVibra', true);
            this.hourlyVibra = this.config.getItem('hourlyVibra', true);
            this.kmVibra = this.config.getItem('kmVibra', false);
            this.kmMelody = this.config.getItem('kmMelody', false);
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
            this.kmAlarm = this.kmVibra || this.kmBuzzer || this.kmMelody; // сигнал каждого км
            this.connectAlarm = this.connectVibra || this.connectBuzzer; // сигнал разрыва связи
            this.hourlyNightOff = this.config.getItem('hourlyNightOff', false);

            if (this.pulseVibra || this.hourlyVibra || this.connectVibra || this.kmMelody) {
                this.vibrator = new hmSensor.Vibrator();
                this.vibratorTypes = this.vibrator.getType();
            }
            if (this.pulseBuzzer || this.hourlyBuzzer || this.connectBuzzer) {
                this.buzzer = new hmSensor.Buzzer();
            }
            if (this.kmMelody) {
                this.melody = new Melody({ vibrator: this.vibrator });
            }

            this.timeSensor = new hmSensor.Time();
            this.dayHandler = () => this.newDay();
            this.hourHandler = () => this.hourly();
            this.connectHandler = (status) => this.connect(status);

            this._bleListening = false;
        } else {
            this.pulseVibra = false;
            this.pulseBuzzer = false;
            this.pulseAlarm = false;
            this.hourlyVibra = false;
            this.hourlyBuzzer = false;
            this.hourlyAlarm = false;
            this.kmVibra = false;
            this.kmBuzzer = false;
            this.kmMelody = false;
            this.kmAlarm = false;
            this.connectVibra = false;
            this.connectBuzzer = false;
            this.connectAlarm = false;
        }

        this.screen = new hmSensor.Screen();

        this.perMinute = false;
        this.perDay = false;
        this.perHour = false;

        this.PROGRESS = {
            STEP: 0,
            CAL: 1,
        };
        this.progress = this.PROGRESS.STEP;

        this.ASTRONOMY = {
            SUN: 0,
            MOON: 1,
        };
        this.astronomy = this.ASTRONOMY.SUN;

        this.CHART = {
            HEART: 0,
            ALT: 1,
            PRE: 2,
        };
        this.chart = this.CHART.HEART;

        // Цветовые зоны высоты
        this.altColors = [
            0xAAAAAA, // ошибка данных
            0x9898FF, // ниже уровня моря
            0xFFFFFF, // низина
            0xB0E8FF, // предгорье
            0x98FF98, // низкогорье
            0xFFFFA0, // горы
            0xFFD8B0, // высокогорье
            0xFF9898, // снежные/ледниковые зоны
        ];

        // Цветовые зоны атмосферного давления
        this.preColors = [
            0xAAAAAA, // ошибка данных
            0x9898FF, // низкое
            0xB0E8FF, // пониженное
            0xFFFFFF, // нормальное
            0xFFD8B0, // повышенное
            0xFF9898, // высокое
        ];

    }

    build() {
        console.log('Watchface build');

        // Задник
        const bg = Layout.background;
        this.bg_line = hmUI.createWidget(hmUI.widget.IMG, bg.line);
        if (this.pulseAlarm) {
            this.bg_heart_alarm = hmUI.createWidget(hmUI.widget.IMG_ANIM, bg.heart_alarm);
            this.bg_heart_alarm.setProperty(hmUI.prop.VISIBLE, false);
        }

        // Bluetoth
        const bluetooth = Layout.bluetooth;
        this.bluetooth_on = hmUI.createWidget(hmUI.widget.IMG, bluetooth.on);
        this.bluetooth_off = hmUI.createWidget(hmUI.widget.IMG_STATUS, bluetooth.off);

        // Блокировка
        const lock = Layout.lock;
        this.lock_off = hmUI.createWidget(hmUI.widget.IMG, lock.off);
        this.lock_on = hmUI.createWidget(hmUI.widget.IMG_STATUS, lock.on);

        // Батарея
        const bat = Layout.battery;
        this.bat_empty = hmUI.createWidget(hmUI.widget.IMG, this.energySaving ? bat.empty_eco : bat.empty);
        this.bat_level = hmUI.createWidget(hmUI.widget.IMG_LEVEL, this.energySaving ? bat.level_eco : bat.level);
        this.bat_percent = hmUI.createWidget(hmUI.widget.TEXT_IMG, bat.percent);

        // Астрономия
        const astro = Layout.astronomy;
        this.astro_moon = hmUI.createWidget(hmUI.widget.IMG_LEVEL, astro.moon);
        this.astro_rise_icon = hmUI.createWidget(hmUI.widget.IMG, astro.rise_icon);
        this.astro_set_icon = hmUI.createWidget(hmUI.widget.IMG, astro.set_icon);
        this.astro_sun_rise = hmUI.createWidget(hmUI.widget.TEXT_IMG, astro.sun_rise);
        this.astro_sun_set = hmUI.createWidget(hmUI.widget.TEXT_IMG, astro.sun_set);
        this.astro_moon_rise = hmUI.createWidget(hmUI.widget.TEXT_IMG, astro.moon_rise);
        this.astro_moon_set = hmUI.createWidget(hmUI.widget.TEXT_IMG, astro.moon_set);

        // График (пульс, высота, давление)
        const chart = Layout.chart;
        this.chart_mask_bg = hmUI.createWidget(hmUI.widget.IMG, chart.mask_bg);
        this.chart_group = hmUI.createWidget(hmUI.widget.GROUP, chart.group);
        if (this.graphMode > 0) { // сутки или 4 дня
            this.chart_line760 = hmUI.createWidget(hmUI.widget.IMG, chart.line760);
        }
        this.chart_icon = hmUI.createWidget(hmUI.widget.IMG, chart.icon);
        this.chart_heart_text = hmUI.createWidget(hmUI.widget.TEXT_FONT, chart.heart_text);
        this.chart_mask = hmUI.createWidget(hmUI.widget.IMG, chart.mask);

        if (!this.energySaving) {
            this.chart_text = hmUI.createWidget(hmUI.widget.TEXT, chart.text);

            // MAX, MIN графиков
            if (this.graphMode > 0) { // сутки или 4 дня
                this.chart_max = hmUI.createWidget(hmUI.widget.TEXT, chart.max);
                this.chart_min = hmUI.createWidget(hmUI.widget.TEXT, chart.min);
            }

            // Время под графиком
            this.chart_time = [];
            for (let i = 0; i < 5; i++) {
                this.chart_time[i] = hmUI.createWidget(hmUI.widget.TEXT, chart.time[i]);
            }
        } else {
            this.chart_alt_text = hmUI.createWidget(hmUI.widget.TEXT_FONT, chart.alt_text);
            this.chart_bar_text = hmUI.createWidget(hmUI.widget.TEXT_FONT, chart.bar_text);
        }

        // Зоны пульса
        const heart = Layout.heart;
        this.heart_level = hmUI.createWidget(hmUI.widget.IMG, heart.level);
        if (this.energySaving) {
            this.heart_level_eco = hmUI.createWidget(hmUI.widget.IMG_LEVEL, heart.level_eco);
        }

        // Прогресс (шаги, калории)
        const progress = Layout.progress;
        this.progress_scale = hmUI.createWidget(hmUI.widget.IMG, progress.scale);
        this.progress_icon = hmUI.createWidget(hmUI.widget.IMG, progress.icon);
        this.progress_step = hmUI.createWidget(hmUI.widget.TEXT_IMG, progress.step);
        this.progress_cal = hmUI.createWidget(hmUI.widget.TEXT_IMG, progress.cal);
        if (!this.energySaving) {
            this.progress_level = hmUI.createWidget(hmUI.widget.IMG, progress.level);
        } else {
            this.progress_level_step_eco = hmUI.createWidget(hmUI.widget.IMG_LEVEL, progress.level_step_eco);
            this.progress_level_cal_eco = hmUI.createWidget(hmUI.widget.IMG_LEVEL, progress.level_cal_eco);
        }

        // Дистанция
        const dist = Layout.distance;
        this.dist_km = hmUI.createWidget(hmUI.widget.TEXT_IMG, dist.km);
        if (!this.energySaving) {
            // Отображение дистанции в метрах
            this.dist_m = hmUI.createWidget(hmUI.widget.TEXT_IMG, dist.m);
            this.dist_km.setProperty(hmUI.prop.VISIBLE, false);
            this.distMode = 0; // дистанция в м
        }

        if (!this.energySaving || this.kmAlarm) {
            this.distanceHandler = () => this.updateDistance();
            this.distance = new hmSensor.Distance();
            this.km = Math.floor(this.distance.getCurrent() / 1000);
        }

        // Погода
        const weather = Layout.weather;
        this.weather_level = hmUI.createWidget(hmUI.widget.IMG_LEVEL, weather.level);
        this.weather_low = hmUI.createWidget(hmUI.widget.TEXT_IMG, weather.low);
        this.weather_separator = hmUI.createWidget(hmUI.widget.IMG, weather.separator);
        this.weather_high = hmUI.createWidget(hmUI.widget.TEXT_IMG, weather.high);

        // Будильник
        const alarm = Layout.alarm;
        this.alarm_off = hmUI.createWidget(hmUI.widget.IMG, alarm.off);
        this.alarm_on = hmUI.createWidget(hmUI.widget.IMG_STATUS, alarm.on);

        // Время
        const time = Layout.time;
        this.time_week = hmUI.createWidget(hmUI.widget.IMG_WEEK, time.week);
        this.time_month = hmUI.createWidget(hmUI.widget.IMG_DATE, time.month);
        this.time_day = hmUI.createWidget(hmUI.widget.IMG_DATE, time.day);
        this.time_clock = hmUI.createWidget(hmUI.widget.IMG_TIME, time.clock);

        // Компас
        if (this.compassMode) {
            this.compass_pointer = hmUI.createWidget(hmUI.widget.IMG, Layout.compass.pointer);
            this._lastAngle = 0;
            if (this.targetMode) {
                this.compass_target = hmUI.createWidget(hmUI.widget.IMG, Layout.compass.target);
            }
        }

        if (!this.energySaving) {

            // Анимация сердечного ритма
            this.heartAnim = new HeartAnim({
                param: {
                    x: chart.icon.x,
                    y: chart.icon.y,
                },
                group: this.chart_group,
                // Выделение цветом зон пульса
                zone_func: (zone) => {
                    const src = `hr_${zone}.png`;
                    this.heart_level.setProperty(hmUI.prop.MORE, { src: src });
                },
                alarm_on_func: () => this.alarmOn(),
                alarm_off_func: () => this.alarmOff(),
            });
            this.heartAnim.offAnim(); // пока отключаем анимацию пульса, в resume() будет включена

            const altZoneFunc = (zone) => {
                const color = this.altColors[zone];
                this.chart_text.setColor(color);
            };
            const barZoneFunc = (zone) => {
                const color = this.preColors[zone];
                this.chart_text.setColor(color);
            };

            // Вывод высоты в м
            this.altitude = new Altitude({
                widget: this.chart_text,
                zone_func: altZoneFunc,
            });

            // Вывод атмосферного давления в мм рт.ст.
            this.barometer = new Barometer({
                widget: this.chart_text,
                zone_func: barZoneFunc,
                pressureMode: this.pressureMode,
            });

        }

        // Тап-зоны
        const tap = Layout.tap;
        this.tap_bat = hmUI.createWidget(hmUI.widget.IMG_CLICK, tap.battery);
        this.tap_weather = hmUI.createWidget(hmUI.widget.IMG_CLICK, tap.weather);
        this.tap_calendar = hmUI.createWidget(hmUI.widget.BUTTON, {
            ...tap.calendar,
            click_func: () => Router.launchApp({ appId: Router.SYSTEM_APP_CALENDAR, native: true }),
        });

        // Тап-зона по показателю (пульс, высота, атм. давление)
        this.tap_heart_alt_pre = null;

        this.tap_astronomy_1 = hmUI.createWidget(hmUI.widget.BUTTON, {
            ...tap.astronomy_1,
            click_func: () => this.changeAstronomy(),
        });
        this.tap_astronomy_2 = hmUI.createWidget(hmUI.widget.BUTTON, {
            ...tap.astronomy_2,
            click_func: () => this.changeAstronomy(),
        });
        this.tap_progress = hmUI.createWidget(hmUI.widget.BUTTON, {
            ...tap.progress,
            click_func: () => this.changeProgress(),
        });
        this.tap_chart = hmUI.createWidget(hmUI.widget.BUTTON, {
            ...tap.chart,
            click_func: () => this.changeChart(),
        });
        this.tap_alarm = hmUI.createWidget(hmUI.widget.IMG_CLICK, tap.alarm);
        this.tap_step = hmUI.createWidget(hmUI.widget.IMG_CLICK, tap.step);

        if (this.compassMode && this.targetMode) {
            this.tap_target = hmUI.createWidget(hmUI.widget.BUTTON, {
                ...tap.target,
                click_func: () => this.setTarget(),
            });
        }

        this.stepIcon = 'step.png';
        this.calIcon = 'calorie.png';

        if (!this.energySaving) {

            // Прогресс по шагам
            this.stepProgress = new Progress({
                sensor: new hmSensor.Step(),
                widget: this.progress_level,
                prefix: 'step_',
                count: 21, // 21 - число изображений прогресса (нумерация от 1)
                complete_func: () => {
                    this.stepIcon = 'step_completed.png';
                    this.displayProgress();
                },
                reset_func: () => {
                    this.stepIcon = 'step.png';
                    this.displayProgress();
                },
            });

            // Прогресс по калориям
            this.calProgress = new Progress({
                sensor: new hmSensor.Calorie(),
                widget: this.progress_level,
                prefix: 'calorie_',
                count: 21, // 21 - число изображений прогресса (нумерация от 1)
                complete_func: () => {
                    this.calIcon = 'calorie_completed.png';
                    this.displayProgress();
                },
                reset_func: () => {
                    this.calIcon = 'calorie.png';
                    this.displayProgress();
                },
            });

        }

        this.initProgress();
        this.initAstronomy();
        this.initChart();

        if (this.compassMode) {
            this.initCompass();
        }
    }

    resume() {
        console.log('Watchface resume');

        // Ежечасный сигнал
        if (this.hourlyAlarm) {
            this.onPerHour();
        }

        // Сигнал разрыва связи
        if (this.connectAlarm) {
            this.connectTimeout = setTimeout(() => {
                this.connectTimeout = null;
                if (!this._bleListening) {
                    this._bleListening = true;
                    hmBle.addListener(this.connectHandler);
                }
            }, 1000);
        }

        // Апдейт дистанции
        if (!this.energySaving || this.kmAlarm) {
            this.distance.onChange(this.distanceHandler);
            if (this.kmAlarm && this.screen.getAodMode()) {
                this.km = Math.floor(this.distance.getCurrent() / 1000);
            }
            this.updateDistance();
        }

        // Если режим экономии энергии - выходим
        if (this.energySaving) return;

        // Показатели
        switch (this.chart) {
            case this.CHART.HEART:
                this.heartAnim.onAnim();
                break;
            case this.CHART.ALT:
                this.altitude.update();
                this.altitude.start();
                break;
            case this.CHART.PRE:
                this.barometer.update();
                break;
        }
        this.heartAnim.update();
        this.heartAnim.start();

        // Перезапуск тревоги (при выходе из AOD resume() запустится раньше, чем onDestroy() в AOD)
        if (this.pulseAlarm && this.heartAnim.isAlarm()) {
            this.pulseAlarmTimeout = setTimeout(() => {
                this.pulseAlarmTimeout = null;
                if (this.heartAnim.isAlarm()) {
                    this.alarmOn();
                }
            }, 1000);
        }

        // Обновление данные по высоте и атм. давлению
        let changed = false;
        if (this.screen.getAodMode()) {
            changed = this.barometer2.reload();
        }
        this.barometer2.update(changed);
        //this.barometer2.start(); // start() не нужен, так как событие приходит крайне редко

        // Графики
        if (this.graphMode == 0 && (this.chart === this.CHART.ALT || this.chart === this.CHART.PRE)) { // график на 4 часа
            this.graphTime();
            this.onPerMinute();
        }
        if (this.graphMode > 0) { // графики на сутки или 4 дня
            this.onPerDay();
        }

        // Запуск компаса
        if (this.compassMode) {
            this.startCompass();
            this.changeCompass();
        }

        // Апдейт прогресса
        switch (this.progress) {
            case this.PROGRESS.STEP:
                this.stepProgress.start();
                this.stepProgress.update();
                break;
            case this.PROGRESS.CAL:
                this.calProgress.start();
                this.calProgress.update();
                break;
        }
    }

    pause() {
        console.log('Watchface pause');

        // Ежечасный сигнал
        this.offPerHour();

        // Сигнал каждого км (мелодия)
        if (this.kmMelody && this.melody.isPlaying) {
            this.melody.stop();
        }

        // Сигнал разрыва связи
        if (this.connectAlarm) {
            if (this.connectTimeout) {
                clearTimeout(this.connectTimeout);
                this.connectTimeout = null;
            }
            if (this._bleListening) {
                this._bleListening = false;
                hmBle.removeListener(this.connectHandler);
            }
        }

        // Апдейт дистанции
        if (!this.energySaving || this.kmAlarm) {
            this.distance.offChange(this.distanceHandler);
        }

        // Если режим экономии энергии - выходим
        if (this.energySaving) return;

        // Остановка тревоги
        if (this.pulseAlarm) {
            if (this.pulseAlarmTimeout) {
                clearTimeout(this.pulseAlarmTimeout);
                this.pulseAlarmTimeout = null;
            }
            this.heartAnim.clearAlarm();
        }

        // Графики
        switch (this.chart) {
            case this.CHART.HEART:
                this.heartAnim.offAnim();
                break;
            case this.CHART.ALT:
                this.altitude.stop();
                break;
        }
        this.heartAnim.stop();
        //this.barometer2.stop(); // stop() убрал, так как убрал start()

        // Остановка таймеров
        this.offPerMinute();
        this.offPerDay();

        // Остановка компаса
        if (this.compassMode) {
            this.stopCompass();
        }

        // Остановка прогресса
        switch (this.progress) {
            case this.PROGRESS.STEP:
                this.stepProgress.stop();
                break;
            case this.PROGRESS.CAL:
                this.calProgress.stop();
                break;
        }

    }

    onDestroy() {
        console.log('Watchface destroy');

        this.config.close();
    }

    // Дистанция в км / м
    updateDistance() {
        const current = this.distance.getCurrent();

        // Сигнал на каждый километр
        if (this.kmAlarm) {
            const km = Math.floor(current / 1000);
            if (km !== this.km) {
                if (km > this.km && current % 1000 < 95) this.kmPassed();
                this.km = km;
            }
            if (this.energySaving) return;
        }

        if (current < 1000) { // дистанция в м
            this.dist_m.setProperty(hmUI.prop.TEXT, current.toString());
            if (this.distMode === 1) {
                this.distMode = 0;
                this.dist_km.setProperty(hmUI.prop.VISIBLE, false);
                this.dist_m.setProperty(hmUI.prop.VISIBLE, true);
            }
        } else { // дистанция в км
            if (this.distMode === 0) {
                this.distMode = 1;
                this.dist_m.setProperty(hmUI.prop.VISIBLE, false);
                this.dist_km.setProperty(hmUI.prop.VISIBLE, true);
            }
        }
    }

    // Функции отображения прогресса (шаги, калории)

    initProgress() {
        this.progress = this.config.getItem('progressMode', this.progress);
        if (!this.energySaving) {
            switch (this.progress) {
                case this.PROGRESS.STEP:
                    this.stepProgress.start();
                    break;
                case this.PROGRESS.CAL:
                    this.calProgress.start();
                    break;
            }
        }
        this.displayProgress();
    }

    displayProgress() {
        switch (this.progress) {
            case this.PROGRESS.STEP:
                if (this.energySaving) {
                    this.progress_level_cal_eco.setProperty(hmUI.prop.VISIBLE, false);
                    this.progress_level_step_eco.setProperty(hmUI.prop.VISIBLE, true);
                }
                this.progress_cal.setProperty(hmUI.prop.VISIBLE, false);
                this.progress_step.setProperty(hmUI.prop.VISIBLE, true);
                this.progress_icon.setProperty(hmUI.prop.MORE, { src: this.stepIcon });
                break;
            case this.PROGRESS.CAL:
                if (this.energySaving) {
                    this.progress_level_step_eco.setProperty(hmUI.prop.VISIBLE, false);
                    this.progress_level_cal_eco.setProperty(hmUI.prop.VISIBLE, true);
                }
                this.progress_step.setProperty(hmUI.prop.VISIBLE, false);
                this.progress_cal.setProperty(hmUI.prop.VISIBLE, true);
                this.progress_icon.setProperty(hmUI.prop.MORE, { src: this.calIcon });
                break;
        }
    }

    changeProgress() {
        this.progress = (this.progress + 1) % 2;
        if (!this.energySaving) {
            switch (this.progress) {
                case this.PROGRESS.STEP:
                    this.calProgress.stop();
                    this.stepProgress.refresh();
                    this.stepProgress.start();
                    break;
                case this.PROGRESS.CAL:
                    this.stepProgress.stop();
                    this.calProgress.refresh();
                    this.calProgress.start();
                    break;
            }
        }
        this.displayProgress();
        this.config.setItem('progressMode', this.progress);
    }

    // Астрономические функции (Солнце, Луна)

    initAstronomy() {
        this.astronomy = this.config.getItem('astronomyMode', this.astronomy);
        this.displayAstronomy();
    }

    displayAstronomy() {
        const sunWidgets = [
            this.astro_sun_rise,
            this.astro_sun_set,
        ];
        const moonWidgets = [
            this.astro_moon_rise,
            this.astro_moon_set,
        ];
        switch (this.astronomy) {
            case this.ASTRONOMY.SUN:
                this.widgetsVisible(moonWidgets, false);
                this.widgetsVisible(sunWidgets, true);
                this.astro_rise_icon.setProperty(hmUI.prop.MORE, { src: 'sunrise.png' });
                this.astro_set_icon.setProperty(hmUI.prop.MORE, { src: 'sunset.png' });
                break;
            case this.ASTRONOMY.MOON:
                this.widgetsVisible(sunWidgets, false);
                this.widgetsVisible(moonWidgets, true);
                this.astro_rise_icon.setProperty(hmUI.prop.MORE, { src: 'moonrise.png' });
                this.astro_set_icon.setProperty(hmUI.prop.MORE, { src: 'moonset.png' });
                break;
        }
    }

    changeAstronomy() {
        this.astronomy = (this.astronomy + 1) % 2;
        this.displayAstronomy();
        this.config.setItem('astronomyMode', this.astronomy);
    }

    // Анимация компаса

    initCompass() {
        this.compassTarget = this.config.getItem('target', 180);
        this.compass = new hmSensor.Compass();
        if (typeof this.compass.setFreqMode === 'function') {
            let freq = hmSensor.FREQ_MODE_LOW;
            switch (this.compassMode) {
                case 1:
                    freq = hmSensor.FREQ_MODE_HIGH; // Быстрый
                    break;
                case 2:
                    freq = hmSensor.FREQ_MODE_NORMAL; // Нормальный
                    break;
                case 3:
                    freq = hmSensor.FREQ_MODE_LOW; // Медленный
                    break;
            }
            this.compass.setFreqMode(freq);
        }
    }

    changeCompass() {
        const raw = this.compass.getDirectionAngle();
        const angle = (raw !== 'INVALID') ? raw : 0;
        if (angle === this._lastAngle) return;

        this._lastAngle = angle;
        this.compass_pointer.setProperty(hmUI.prop.ANGLE, -angle);

        if (this.targetMode) {
            const delta = this.compassTarget - angle;
            this.compass_target.setProperty(hmUI.prop.ANGLE, delta);
            const rad = (delta + 90) * RAD;
            const x = Math.floor(190 + 229 * Math.cos(rad));
            const y = Math.floor(190 + 229 * Math.sin(rad));
            this.tap_target.setProperty(hmUI.prop.MORE, {
                x,
                y,
                w: Layout.tap.target.w,
                h: Layout.tap.target.h,
            });
        }
    }

    startCompass() {
        if (this._compassStarted) return;
        this._compassStarted = true;
        this.compass.onChange(this.changeCompassHandler);
        this.compass.start();
    }

    stopCompass() {
        if (!this._compassStarted) return;
        this._compassStarted = false;
        this.compass.offChange(this.changeCompassHandler);
        this.compass.stop();
    }

    setTarget() {
        const raw = this.compass.getDirectionAngle();
        this.compassTarget = (raw !== 'INVALID') ? raw - 180 : 0;
        this.config.setItem('target', this.compassTarget);
        this._lastAngle = -1;
        this.changeCompass();
    }

    // Диаграмма (пульс, высота, давление)

    initChart() {
        if (!this.energySaving) {
            // Графики и показания барометра и высотомера
            let params = { pressureMode: this.pressureMode };
            if (this.graphMode > 0) { // графики на сутки или 4 дня
                params = {
                    ...params,
                    line760_widget: this.chart_line760,
                    period: this.graphMode == 1 ? PERIOD.ONE_DAY : PERIOD.FOUR_DAYS, // 1 - сутки, 2 - 4 дня
                    newDay_func: this.graphMode == 2 ? () => this.graphTime() : null,
                    show_func: () => this.graphMaxMin(),
                };
                // Событие на срабатывание в полночь и обновления графика
                this.onPerDay();
            }
            this.barometer2 = new Barometer2(params);
            if (!this.screen.getAodMode()) {
                this.barometer2.reload(); // а если включен AOD, то reload() будет в resume()
            }
        }

        this.chart = this.config.getItem('chartMode', this.chart);
        this.updateMetricTapZone();
        this.displayChart();
    }

    displayChart() {
        this.showChart();

        switch (this.chart) {
            case this.CHART.HEART: // Пульс
                if (this.energySaving) {
                    this.chart_icon.setProperty(hmUI.prop.MORE, { src: 'animation/heart_5.png' });
                    this.chart_alt_text.setProperty(hmUI.prop.VISIBLE, false);
                    this.chart_bar_text.setProperty(hmUI.prop.VISIBLE, false);
                    this.heart_level_eco.setProperty(hmUI.prop.VISIBLE, true);
                } else {
                    this.chart_icon.setProperty(hmUI.prop.VISIBLE, false);
                    this.chart_text.setProperty(hmUI.prop.VISIBLE, false);
                    this.heartAnim.setVisible(true);
                }
                this.chart_heart_text.setProperty(hmUI.prop.VISIBLE, true);
                this.heart_level.setProperty(hmUI.prop.VISIBLE, true);
                if (this.graphMode > 0) {
                    this.barometer2.setMode(BAR_MODE.NONE);
                    this.chart_max.setProperty(hmUI.prop.TEXT, '');
                    this.chart_min.setProperty(hmUI.prop.TEXT, '');
                }
                break;

            case this.CHART.ALT: // Высота
                if (this.energySaving) {
                    this.heart_level_eco.setProperty(hmUI.prop.VISIBLE, false);
                    this.chart_bar_text.setProperty(hmUI.prop.VISIBLE, false);
                    this.chart_alt_text.setProperty(hmUI.prop.VISIBLE, true);
                } else {
                    this.heartAnim.setVisible(false);
                    this.chart_icon.setProperty(hmUI.prop.VISIBLE, true);
                    this.chart_text.setProperty(hmUI.prop.VISIBLE, true);
                }
                this.chart_heart_text.setProperty(hmUI.prop.VISIBLE, false);
                this.heart_level.setProperty(hmUI.prop.VISIBLE, false);
                this.chart_icon.setProperty(hmUI.prop.MORE, { src: 'alt.png' });
                if (this.graphMode > 0) {
                    this.barometer2.setMode(BAR_MODE.ALT, this.chart_widget);
                    this.graphMaxMin();
                }
                break;

            case this.CHART.PRE: // Давление
                if (this.energySaving) {
                    this.heart_level_eco.setProperty(hmUI.prop.VISIBLE, false);
                    this.chart_alt_text.setProperty(hmUI.prop.VISIBLE, false);
                    this.chart_bar_text.setProperty(hmUI.prop.VISIBLE, true);
                } else {
                    this.heartAnim.setVisible(false);
                    this.chart_icon.setProperty(hmUI.prop.VISIBLE, true);
                    this.chart_text.setProperty(hmUI.prop.VISIBLE, true);
                }
                this.chart_heart_text.setProperty(hmUI.prop.VISIBLE, false);
                this.heart_level.setProperty(hmUI.prop.VISIBLE, false);
                this.chart_icon.setProperty(hmUI.prop.MORE, { src: 'pre.png' });
                if (this.graphMode > 0) {
                    this.barometer2.setMode(BAR_MODE.BAR, this.chart_widget);
                    this.graphMaxMin();
                }
                break;
        }
        if (!this.energySaving) {
            this.graphTime();
            if (this.graphMode == 0 && (this.chart === this.CHART.ALT || this.chart === this.CHART.PRE)) { // график на 4 часа
                this.onPerMinute();
            } else {
                this.offPerMinute();
            }
        }
    }

    changeChart() {
        this.chart = (this.chart + 1) % 3;
        if (!this.energySaving) {
            switch (this.chart) {
                case this.CHART.HEART:
                    this.altitude.stop();
                    this.heartAnim.onAnim();
                    this.heartAnim.update();
                    break;
                case this.CHART.ALT:
                    this.heartAnim.offAnim();
                    this.altitude.refresh();
                    this.altitude.start();
                    break;
                case this.CHART.PRE:
                    this.heartAnim.offAnim();
                    this.altitude.stop();
                    this.barometer.refresh();
                    break;
            }
        }
        this.displayChart();
        this.updateMetricTapZone();
        this.config.setItem('chartMode', this.chart);
    }

    // Тап-зона по показателю (пульс, высота, атм. давление)
    updateMetricTapZone() {
        // Удаляем предыдущую зону, если она существует
        if (this.tap_heart_alt_pre) {
            hmUI.deleteWidget(this.tap_heart_alt_pre);
        }

        // Создаем актуальную зону нажатия
        switch (this.chart) {
            case this.CHART.HEART: // Пульс
                this.tap_heart_alt_pre = hmUI.createWidget(hmUI.widget.IMG_CLICK, Layout.tap.heart);
                break;
            case this.CHART.ALT: // Высота
                this.tap_heart_alt_pre = hmUI.createWidget(hmUI.widget.IMG_CLICK, Layout.tap.altitude);
                break;
            case this.CHART.PRE: // Давление
                this.tap_heart_alt_pre = hmUI.createWidget(hmUI.widget.BUTTON, {
                    ...Layout.tap.altimeter,
                    click_func: () => Router.launchApp({ appId: Router.SYSTEM_APP_ALTIMETER, native: true }),
                });
                break;
            default:
                this.tap_heart_alt_pre = null;
        }
    }

    showChart() {
        if (this.chart_widget) {
            this.chart_widget.setProperty(hmUI.prop.VISIBLE, false);
            hmUI.deleteWidget(this.chart_widget);
            this.chart_widget = undefined;
        }

        switch (this.chart) {
            case this.CHART.HEART: // Пульс
                this.chart_widget = this.chart_group.createWidget(hmUI.widget.GRADKIENT_POLYLINE, Layout.chart.heart);
                break;
            case this.CHART.ALT: // Высота
                if (this.graphMode > 0) { // сутки или 4 дня
                    this.chart_widget = this.chart_group.createWidget(hmUI.widget.GRADKIENT_POLYLINE, Layout.chart.altitude);
                } else { // 4 часа
                    this.chart_widget = this.chart_group.createWidget(hmUI.widget.GRADKIENT_POLYLINE, {
                        ...Layout.chart.altitude,
                        curve_style: true,
                        type: hmUI.data_type.ALTITUDE,
                    });
                }
                break;
            case this.CHART.PRE: // Давление
                if (this.graphMode > 0) { // сутки или 4 дня
                    this.chart_widget = this.chart_group.createWidget(hmUI.widget.GRADKIENT_POLYLINE, Layout.chart.pressure);
                } else { // 4 часа
                    this.chart_widget = this.chart_group.createWidget(hmUI.widget.GRADKIENT_POLYLINE, {
                        ...Layout.chart.pressure,
                        curve_style: true,
                        type: hmUI.data_type.BARO,
                    });
                }
                break;
        }
    }

    // Показать / скрыть группу виджетов
    widgetsVisible(widgets, visible) {
        widgets.forEach(w => w.setProperty(hmUI.prop.VISIBLE, visible));
    }

    // Подписи к графику
    graphTime() {
        let time = ['', '', '', '', ''];

        if (this.chart === this.CHART.HEART || this.graphMode == 1) { // суточный график
            time = ['0', '6', '12', '18', '24'];
        } else if (this.graphMode == 2) { // график на 4 дня
            const d = new Date();
            for (let i = 3; i >= 0; i--) {
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                time[i] = `${day}.${month}`;
                d.setDate(d.getDate() - 1);
            }
        } else { // график на 4 часа
            const d = new Date();
            for (let i = 4; i >= 0; i--) {
                const hours = String(d.getHours()).padStart(2, '0');
                const minutes = String(d.getMinutes()).padStart(2, '0');
                time[i] = `${hours}:${minutes}`;
                d.setHours(d.getHours() - 1);
            }
        }

        for (let i = 0; i < 5; i++) {
            this.chart_time[i].setProperty(hmUI.prop.TEXT, time[i]);
        }
    }

    // Max, min графика
    graphMaxMin() {
        const maxMin = this.barometer2.maxMin;
        this.chart_max.setProperty(hmUI.prop.TEXT, maxMin.max.toString());
        this.chart_min.setProperty(hmUI.prop.TEXT, maxMin.min.toString());
    }

    alarmOn() {
        this.chart_heart_text.setColor(0xFF9898);

        if (this.pulseAlarm) {
            this.bg_heart_alarm.setProperty(hmUI.prop.VISIBLE, true);

            const mode = getSystemMode();
            if (mode.DND) return; // режим "Не беспокоить"

            if (this.pulseVibra) {
                this.vibrator.start({ mode: hmSensor.VIBRATOR_SCENE_STRONG_REMINDER });
            }

            if (mode.theater) return; // режим "Театр"

            if (this.pulseBuzzer) {
                this.buzzer.start(5, -1);
            }
        }
    }

    alarmOff() {
        this.chart_heart_text.setColor(Layout.chart.heart_text.color);

        if (this.pulseAlarm) {
            this.bg_heart_alarm.setProperty(hmUI.prop.VISIBLE, false);

            if (this.pulseVibra) {
                this.vibrator.stop();
            }

            if (this.pulseBuzzer) {
                this.buzzer.stop();
            }
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
            this.heartAnim.clearAlarm();
        }

        // Вибрация
        if (this.hourlyVibra) {
            this.vibratorNotification();
        }

        if (mode.theater) return; // режим "Театр"

        // Зуммер
        if (this.hourlyBuzzer) {
            this.buzzer.start(3);
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
            this.buzzer.start(4, 2);
        }

        // Мелодия
        if (this.kmMelody) {
            this.melody.start();
        }
    }

    connect(status) {
        if (status) {
            hmUI.showToast({ text: 'BL ON' });
        } else {
            hmUI.showToast({ text: 'BL OFF' });
        }

        const mode = getSystemMode();
        if (mode.DND) return; // режим "Не беспокоить"

        // Если тревога по макс пульсу - остановить
        if (this.pulseAlarm) {
            this.heartAnim.clearAlarm();
        }

        // Вибрация
        if (this.connectVibra) {
            this.vibratorNotification();
        }

        if (mode.theater) return; // режим "Театр"

        // Зуммер
        if (this.connectBuzzer) {
            this.buzzer.start(status ? 5 : 6);
        }
    }

    vibratorNotification() {
        this.vibrator.start([
            { type: this.vibratorTypes.CONTINUOUS, duration: 30 },
            { type: this.vibratorTypes.PAUSE, duration: 5 },
            { type: this.vibratorTypes.CONTINUOUS, duration: 150 },
        ]);
    }

    onPerMinute() {
        if (!this.perMinute) {
            this.timeSensor.onPerMinute(this.minuteHandler);
            this.perMinute = true;
        }
    }

    offPerMinute() {
        if (this.perMinute) {
            this.timeSensor.offPerMinute(this.minuteHandler);
            this.perMinute = false;
        }
    }

    newDay() {
        this.barometer2.update();
    }

    onPerDay() {
        if (!this.perDay) {
            this.timeSensor.onPerDay(this.dayHandler);
            this.perDay = true;
        }
    }

    offPerDay() {
        if (this.perDay) {
            this.timeSensor.offPerDay(this.dayHandler);
            this.perDay = false;
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

}
