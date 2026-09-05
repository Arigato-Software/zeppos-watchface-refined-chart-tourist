import * as hmSensor from '@zos/sensor'
import * as hmFS from '@zos/fs'
import { getPackageInfo } from '@zos/app'
import { getSystemMode } from '@zos/settings'

import Layout from './settings.layout.js'
import { Config } from '../classes/config'
import { Settings } from '../classes/settings'

export default class SettingsScene {

    constructor(params){
        console.log('Settings init');

        this.page = params;
        this.config = new Config();
        this.settings = new Settings({
            layout: Layout.settings,
        });
        this.main = false;
    }

    build(){
        console.log('Settings build');

        this.settings.scrollBar();
        
        switch (this.page){
            case 'graphs':
                this.pageGraphs();
                break;
            case 'graphs_help':
                this.pageGraphsHelp();
                break;
            case 'compass':
                this.pageCompass();
                break;
            case 'compass_help':
                this.pageCompassHelp();
                break;
            case 'target_help':
                this.pageTargetHelp();
                break;
            case 'signals':
                this.pageSignals();
                break;
            case 'signals_help':
                this.pageSignalsHelp();
                break;
            case 'hourly':
                this.pageHourly();
                break;
            case 'hourly_night_help':
                this.pageHourlyNightHelp();
                break;
            case 'km':
                this.pageKm();
                break;
            case 'km_help':
                this.pageKmHelp();
                break;
            case 'alarm':
                this.pageAlarm();
                break;
            case 'alarm_help':
                this.pageAlarmHelp();
                break;
            case 'connect':
                this.pageConnect();
                break;
            case 'connect_help':
                this.pageConnectHelp();
                break;
            case 'aod':
                this.pageAOD();
                break;
            case 'aod_help':
                this.pageAODHelp();
                break;
            case 'energy':
                this.pageEnergy();
                break;
            case 'energy_help':
                this.pageEnergyHelp();
                break;                
            case 'reset':
                this.pageReset();
                break;
            case 'about':
                this.pageAbout();
                break;
            default:
                this.pageMain();
                this.main = true;
        }
        
        this.settings.addFooter();

        if (this.main){
            this.settings.backButton();
        } else {
            this.settings.homeButton();
        }
    }

    onDestroy(){
        console.log('Settings destroy');
    }

    pageMain(){
        this.settings.title({text: 'Настройки циферблата'});

        const energySaving = this.config.getItem('energySaving', false);
        const powerSaving = getSystemMode()['powerSaving'];

        if (energySaving){
            this.settings.addHint({text: 'Эконом режим: ВКЛ'});
        }        

        if (powerSaving){
            this.settings.addLink({
                text: 'Эконом режим',
                click_func: () => {this.settings.openPage('energy')},
            });
        }

        this.settings.addLink({
            text: 'Графики',
            click_func: () => {this.settings.openPage('graphs')},
        });

        this.settings.addLink({
            text: 'Компас',
            click_func: () => {this.settings.openPage('compass')},
        });
        
        if (!powerSaving){
            this.settings.addLink({
                text: 'Эконом режим',
                click_func: () => {this.settings.openPage('energy')},
            });
        }

        this.settings.addLink({
            text: 'Сигналы',
            click_func: () => {this.settings.openPage('signals')},
        });

        this.settings.addLink({
            text: 'Экран AOD',
            click_func: () => {this.settings.openPage('aod')},
        });

        this.settings.addLink({
            text: 'Сброс данных',
            click_func: () => {this.settings.openPage('reset')},
        });

        this.settings.addHelpButton({
            click_func: () => {this.settings.openPage('about')},
        });
    }

    pageSignals(){
        this.settings.title({text: 'Сигналы и оповещения'});

        this.settings.addLink({
            text: 'Ежечас. сигнал',
            click_func: () => {this.settings.openPage('hourly')},
        });

        this.settings.addLink({
            text: 'Каждый км',
            click_func: () => {this.settings.openPage('km')},
        });

        this.settings.addLink({
            text: 'Макс. пульс',
            click_func: () => {this.settings.openPage('alarm')},
        });

        this.settings.addLink({
            text: 'Разрыв связи',
            click_func: () => {this.settings.openPage('connect')},
        });

        this.settings.addHelpButton({
            click_func: () => {this.settings.openPage('signals_help')},
        });
    }

    pageSignalsHelp(){
        this.settings.addAbout({
            title: 'Сигналы и оповещения',
            text: this.getBuzzerHelp(),
        });
    }

    pageGraphs(){
        this.settings.title({text: 'Графики высоты и атм. давления'});

        const items = [
            'За 4 часа',
            'За сутки',
            'За 4 дня',                
        ]

        this.settings.addRadioGroup({
            items,
            init: this.config.getItem('graphsMode', 1),
            click_func: (index) => {
                this.setItem('graphsMode', index);
            },
        });

        this.settings.addHelpButton({
            click_func: () => {this.settings.openPage('graphs_help')},
        });
    }

    pageGraphsHelp(){
        this.settings.addAbout({
            title: 'Графики высоты и атм. давления',
            text: 'Графики за сутки и за 4 дня строятся по накопленным данным. ' +
                  'Накопление данных происходит при активном циферблате или на экране AOD.',
        });
    }

    pageCompass(){
        this.settings.title({text: 'Компас'});

        let items = [
            'Нет',
            'Медленный',
            'Нормальный',
            'Быстрый',
        ];

        const compass = new hmSensor.Compass();
        if (typeof compass.setFreqMode !== 'function'){
            items = items.slice(0, 2);
        }

        this.settings.addRadioGroup({
            items,
            init: this.config.getItem('compassMode', 0),
            click_func: (index) => {
                this.setItem('compassMode', index);
            },
        });

        this.settings.addHelpButton({
            click_func: () => {this.settings.openPage('compass_help')},
        });

        //this.settings.addIndent();

        this.settings.addCheckboxGroup({
            items: ['Маркер азимута'],
            init: [this.config.getItem('targetEnabled', false)],
            click_func: (index, checked) => {
                if (index === 0){
                    this.setItem('targetEnabled', checked);
                }
            },
        });

        this.settings.addHelpButton({
            click_func: () => {this.settings.openPage('target_help')},
        });
    }

    pageCompassHelp(){
        this.settings.addAbout({
            title: 'Компас',
            text: 'Компас расходует дополнительную энергию. ' +
                  'Включайте его по мере необходимости.',
        });
    }

    pageTargetHelp(){
        this.settings.addAbout({
            title: 'Маркер азимута',
            text: 'Красная точка на шкале компаса, указывающая заданное направление. ' +
                  'Повернитесь в нужную сторону, совместив направление с 12 часами, и нажмите на маркер.',
        });
    }

    pageHourly(){
        this.settings.title({text: 'Ежечасный сигнал'});

        this.AODHint();

        const items = this.alarmItems();
        const init = [
            this.config.getItem('hourlyVibra', true),
            this.config.getItem('hourlyBuzzer', true),
        ];

        this.settings.addCheckboxGroup({
            items,
            init,
            click_func: (index, checked) => {
                switch (index){
                    case 0:
                        this.setItem('hourlyVibra', checked);
                        break;
                    case 1:
                        this.setItem('hourlyBuzzer', checked);
                        break;
                }
            },
        });

        this.settings.addIndent();

        this.settings.addCheckboxGroup({
            items: ['Ночью выкл'],
            init: [this.config.getItem('hourlyNightOff', false)],
            click_func: (index, checked) => {
                if (index === 0){
                    this.setItem('hourlyNightOff', checked);
                }
            },
        });

        this.settings.addHelpButton({
            click_func: () => {this.settings.openPage('hourly_night_help')},
        });
    }

    pageHourlyNightHelp(){
        this.settings.addAbout({
            title: 'Ночью выкл',
            text: 'Выключить ежечасный сигнал в ночное время. ' +
                  'Ночное время действует с 22:00 до 07:00 включительно.',
        });
    }

    pageKm(){
        this.settings.title({text: 'Каждый километр'});

        const items = this.alarmItems();
        const init = [
            this.config.getItem('kmVibra', false),
            this.config.getItem('kmBuzzer', false),
        ];

        this.settings.addCheckboxGroup({
            items,
            init,
            click_func: (index, checked) => {
                switch (index){
                    case 0:
                        this.setItem('kmVibra', checked);
                        break;
                    case 1:
                        this.setItem('kmBuzzer', checked);
                        break;
                }
            },
        });

        this.settings.addCheckboxGroup({
            items: ['Марш'],
            init: [this.config.getItem('kmMelody', false)],
            click_func: (index, checked) => {
                if (index === 0){
                    this.setItem('kmMelody', checked);
                }
            },
        });

        this.settings.addHelpButton({
            click_func: () => {this.settings.openPage('km_help')},
        });
    }

    pageKmHelp(){
        this.settings.addAbout({
            title: 'Каждый километр',
            text: 'Сигнал срабатывает на каждый километр пути. ' +
                  'Марш не проигрывается на экране AOD.',
        });
    }

    pageAlarm(){
        this.settings.title({text: 'Максимальный пульс'});

        this.AODHint();

        const items = this.alarmItems();
        const init = [
            this.config.getItem('pulseVibra', true),
            this.config.getItem('pulseBuzzer', true),
        ];

        this.settings.addCheckboxGroup({
            items,
            init,
            click_func: (index, checked) => {
                switch (index){
                    case 0:
                        this.setItem('pulseVibra', checked);
                        break;
                    case 1:
                        this.setItem('pulseBuzzer', checked);
                        break;
                }
            },
        });

        this.settings.addHelpButton({
            click_func: () => {this.settings.openPage('alarm_help')},
        });
    }

    pageAlarmHelp(){
        this.settings.addAbout({
            title: 'Максимальный пульс',
            text: 'Сигнал тревоги подаётся при превышении значения максимального пульса.',
        });
    }

    pageConnect(){
        this.settings.title({text: 'Разрыв связи'});

        this.AODHint();

        const items = this.alarmItems();
        const init = [
            this.config.getItem('connectVibra', true),
            this.config.getItem('connectBuzzer', true),
        ];

        this.settings.addCheckboxGroup({
            items,
            init,
            click_func: (index, checked) => {
                switch (index){
                    case 0:
                        this.setItem('connectVibra', checked);
                        break;
                    case 1:
                        this.setItem('connectBuzzer', checked);
                        break;
                }
            },
        });

        this.settings.addHelpButton({
            click_func: () => {this.settings.openPage('connect_help')},
        });
    }

    pageConnectHelp(){
        this.settings.addAbout({
            title: 'Разрыв связи',
            text: 'Сигнал при потере или восстановлении связи с телефоном.',
        });
    }

    pageAOD(){
        this.settings.title({text: 'Экран AOD'});

        this.AODHint();

        this.settings.addRadioGroup({
            items: [
                'Время',
                'Затухание',
                'Чёрный экран',
            ],
            init: this.config.getItem('aodMode', 0),
            click_func: (index) => {
                this.setItem('aodMode', index);
            },
        });

        this.settings.addHelpButton({
            click_func: () => {this.settings.openPage('aod_help')},
        });
    }

    pageAODHelp(){
        this.settings.addAbout({
            title: 'Экран AOD',
            text: 'Для повышения точности графиков накопление данных о высоте и атм. давлении продолжается на экране AOD. ' +
                  'Чёрный экран AOD позволяет экономить заряд аккумулятора без прекращения сбора данных.',
        });
    }

    pageEnergy(){
        this.settings.title({text: 'Экономия энергии'});

        this.settings.addCheckboxGroup({
            items: [
                'Эконом режим',
                'Оставить сигналы',
            ],
            init: [
                this.config.getItem('energySaving', false),
                this.config.getItem('leaveSignals', false),
            ],
            click_func: (index, checked) => {
                switch (index){
                    case 0:
                        this.setItem('energySaving', checked);
                        break;
                    case 1:
                        this.setItem('leaveSignals', checked);
                        break;
                }
            },
        });

        this.settings.addHelpButton({
            click_func: () => {this.settings.openPage('energy_help')},
        });
    }

    pageEnergyHelp(){
        this.settings.addAbout({
            title: 'Энергосбережение',
            text: 'В режиме экономии энергии некоторые элементы отсутствуют или заменены на более простые. ' +
                  'Накопление данных о высоте и атм. давлении не ведётся. ' +
                  'Можно оставить сигналы, кроме сигнала максимального пульса.',
        });
    }

    pageReset(){
        const files = [
            'altitude.dat',
            'pressure.dat',
            'altitude_4.dat',
            'pressure_4.dat',
            'current_day.txt',
        ];
        this.settings.showDialog({
            title: 'Сброс данных',
            text: 'Настройки циферблата будут сброшены на первоначальные, удалены данные о высоте и атм. давлении',
            ok_func: () => {
                this.removeFiles(files);
                this.config.clear();
                this.config.save();
            },
        });
    }

    pageAbout(){
        const packageInfo = getPackageInfo()
        const name = packageInfo.name ?? '--';
        const version = packageInfo.version ?? '0.0.0';
        const vender = packageInfo.vender ?? '';

        this.settings.addAbout({
            title: 'О циферблате',
            text: `Циферблат ${name} разработан для туристов и альпинистов. ` +
                  'За основу взят встроенный циферблат Refined Chart от Zepp Health.\n\n' +
                  `Версия: ${version}\n` +
                  `Разработчик: ${vender}, 2026.`,
        });
    }

    AODHint(){
        const screen = new hmSensor.Screen();
        if (!screen.getAodMode()){
            this.settings.addHint({text: 'Экран AOD: ВЫКЛ'});
        }
    }

    alarmItems(){
        const hasBuzzer = hmSensor.checkSensor(hmSensor.Buzzer);
        const items = ['Вибро'];
        if (hasBuzzer){
            items.push('Зуммер');
            const buzzer = new hmSensor.Buzzer();
            if (!buzzer.isEnabled()){
                this.settings.addHint({text: 'Сцены с зуммером: ВЫКЛ'});
            }
        }
        return items;
    }

    getBuzzerHelp(){
        const hasBuzzer = hmSensor.checkSensor(hmSensor.Buzzer);
        let help = 'Для корректной работы функций требуется активный AOD.';
        if (hasBuzzer){
            help += ' Для работы зуммера включите: Настройки - Звук и вибрация - Сцены с зуммером - Другие.';
            help += ' В режиме "Не беспокоить" вибрация и звук не воспроизводятся.';
            help += ' В режиме "Театр" не воспроизводится звук.';
        } else {
            help += ' В режиме "Не беспокоить" вибрация не воспроизводится.';
        }
        return help;
    }

    setItem(key, val){
        if (this.config.getItem(key, null) !== val){
            this.config.setItem(key, val);
            this.config.save();
        }
    }

    removeFiles(files){
        for (const file of files){
            hmFS.rmSync({path: file});
        }
    }

}