import * as hmUI from '@zos/ui'
import * as hmSensor from '@zos/sensor'
import User from '@zos/user'

const HYST = 5; // гистерезис в bpm

/*
Анимация пульса
heartAnim = new HeartAnim(params);
params:
  anim - нужна ли анимация (для AOD: false)
  widget - виджет hmUI.widget.IMG или hmUI.widget.IMG_ANIM для замены (будет удален)
  group - widget.GROUP для вывода анимации
  param - параметры создания виджета (x, y и прочее)
  zone_func - callback смены зоны пульса:
    0 - ошибка данных
    1 - покой
    2 - легкая
    3 - интенсивная
    4 - аэробная
    5 - анаэробная
    6 - МПК
  alarm_on_func - callback оповещения о чрезмерном пульсе, работает только при включенном экране
  alarm_off_func - callback отключения тревоги
start() - запуск отслеживания пульса
stop() - остановка отслеживания пульса
onAnim() - включить анимация (обязательно предварительно создать объект с параметром anim: true)
offAnim() - отключить анимацию (отслеживание пульса не меняется)
update() - обновление анимации пульса
refresh() - принудительная перерисовка анимации пульса
zone - текущая зона пульса
refreshZones() - обновление зон пульса (вообще-то оно нужно один раз в год...)
setVisible(visible) - показать / спрятать виджет анимации пульса
isAlarm() - проверить состояние тревоги
clearAlarm() - сброс состояния тревоги, если пульс в зоне гистерезиса
*/
export class HeartAnim{
  
  constructor(params){
    this._anim = params.anim ?? true;
    this._alarm_on_func = params.alarm_on_func ?? null;
    this._alarm_off_func = params.alarm_off_func ?? null;
    this._sensor = new hmSensor.HeartRate();
    this._alarm = false;
    this._started = false;
    this.refreshZones();
    this._changeHandler = () => this.update();

    if (!this._anim) return;

    this._widget = params.widget ?? null;
    this._group = params.group ?? hmUI;
    this._param = params.param ?? {};
    this._zone_func = params.zone_func ?? null;
    let x = 0;
    let y = 0;
    if (this._widget){
      x = this._widget.getProperty(hmUI.prop.X);
      y = this._widget.getProperty(hmUI.prop.Y);
    }
    this._param = {
      x: x,
      y: y,
      anim_path: "animation",
      anim_ext: "png",
      anim_prefix: "heart",
      anim_size: 6,
      repeat_count: 0,
      anim_repeat: true,
      anim_status: hmUI.anim_status.START,
      ...this._param
    };
    this._src = this._getSrc();
    this._isVisible = true;
    this._zone = -1;
    this._fps = -1;
    this._fpsFactor = this._param.anim_size / 60;
  }
  
  start(){
    if (this._started) return;
    this._started = true;
    this._sensor.onLastChange(this._changeHandler);
  }
  
  stop(){
    if (!this._started) return;
    this._started = false;
    this._sensor.offLastChange(this._changeHandler);
  }

  onAnim(){
    this._anim = true;
  }

  offAnim(){
    this._anim = false;
  }

  update(){
    const bmp = this._sensor.getLast() ?? 0;
   
    // Оповещение о чрезмерном пульсе
    if (bmp < this._hrMax - HYST && this._alarm){
      this._alarm = false;
      this._alarm_off_func?.(bmp);
    } else if (bmp >= this._hrMax && !this._alarm){
      this._alarm = true;
      this._alarm_on_func?.(bmp);
    }

    if (!this._anim) return;

    // Изменение зоны пульса
    if (this._zone_func){
      const zone = this._getZone(bmp);
      if (zone != this._zone){
        this._zone = zone;
        this._zone_func(zone, bmp);
      }
    }

    // Изменение скорости анимации
    const fps = this._rateToFps(bmp);
    if (fps != this._fps){
      this._fps = fps;
      this._deleteWidget();
      this._createWidget();
    }
  }

  refresh(){
    this._zone = -1;
    this._fps = -1;
    this.update();
  }

  get zone(){
    return this._zone;
  }

  refreshZones(){
    this._zones = this._getZones();
  }

  setVisible(visible){
    if (visible){
      if (!this._isVisible){
        this._isVisible = true;
        this._createWidget();
      }
    } else {
      this._isVisible = false;
      this._widget && this._widget.setProperty(hmUI.prop.VISIBLE, false);
      this._deleteWidget();
    }
  }

  isAlarm(){
    return this._alarm;
  }

  clearAlarm(){
    if (this._alarm){
      this._alarm = false;
      this._alarm_off_func?.(0);
      return true;
    }
    return false;
  }

  _rateToFps(bpm){
    return Math.round(bpm * this._fpsFactor);
  }
  
  _getZone(bpm){
    let zone = 0;
    for (; zone < this._zones.length; zone++){
      const hyst = (zone > 0 && this._zone > zone) ? HYST : 0;
      if (bpm < this._zones[zone] - hyst) return zone;
    }
    return zone;
  }
  
  _deleteWidget(){
    this._widget && hmUI.deleteWidget(this._widget);
    this._widget = undefined;
  }
  
  _createWidget(){
    if (!this._isVisible) return;
    if (this._fps > 0){
      this._widget = this._group.createWidget(hmUI.widget.IMG_ANIM, {
        ...this._param,
        anim_fps: this._fps,
      });
    } else {
      this._widget = this._group.createWidget(hmUI.widget.IMG, {
        x: this._param.x,
        y: this._param.y,
        src: this._src,
      });
    }
  }
  
  _getSrc(){
    return `${this._param.anim_path}/${this._param.anim_prefix}_${this._param.anim_size - 1}.${this._param.anim_ext}`;
  }
  
  _getZones(){
    // Зоны пульса, установленные через Zepp
    const workout = new hmSensor.Workout();
    if (typeof workout.getUserHrZoneSettings === 'function'){
      const hrZoneSettings = workout.getUserHrZoneSettings();
      if (hrZoneSettings.range){
        const zones = [
          1,
          ...hrZoneSettings.range.slice(0, 5)
        ];
        this._hrMax = hrZoneSettings.range[5] ?? 180; // зона тревоги
        return zones;
      }
    }

    // Зоны пульса от возраста
    const age = User.getProfile().age;
    this._hrMax = (age && age > 0) ? 220 - age : 180; // зона тревоги
    const zones = [ // нижние границы зон пульса
      1,                       // покой
      Math.floor(this._hrMax * 0.5), // легкая
      Math.floor(this._hrMax * 0.6), // интенсивная
      Math.floor(this._hrMax * 0.7), // аэробная
      Math.floor(this._hrMax * 0.8), // анаэробная
      Math.floor(this._hrMax * 0.9)  // МПК
    ];
    return zones;
  }
  
}