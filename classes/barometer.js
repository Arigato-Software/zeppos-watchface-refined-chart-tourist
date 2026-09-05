import * as hmUI from '@zos/ui'
import * as hmSensor from '@zos/sensor'

/*
Атмосферное давление и высота
barometer = new Barometer(params);
params:
  widget - виджет hmUI.widget.TEXT для вывода давления
  zone_func - callback смены зоны давления:
    0 - ошибка данных
    1 - низкое
    2 - пониженное
    3 - нормальное
    4 - повышенное
    5 - высокое
  data:
    bar - инициализация данных по давлению
    alt - инициализация данных по высоте
setMode(mode) - режим вывода показателей


start() - запуск вывода давления
stop() - остановка вывода давления
update() - обновление значений
refresh() - принудительная перерисовка
zone - текущая зона давления
*/
export class Barometer{

    constructor(params){
      this._widget = params?.widget ?? null;
      this._zone_func = params?.zone_func ?? null;

      this._bar_bound = this._getBarBound();
      this._bar = -1;
      this._bar_zone = -1;
      this._old_bar_zone = -1;
      this._bar_data = params?.data?.bar ?? [];

      this._sensor = new hmSensor.Barometer();
      this._changeHandler = () => this.update();
    }

  start(){
    if (this._started) return;
    this._started = true;
    this._sensor.onChange(this._changeHandler);
  }
  
  stop(){
    if (!this._started) return;
    this._started = false;
    this._sensor.offChange(this._changeHandler);
  }

  update(){
    const hPa = this._sensor.getAirPressure() ?? 0;
    const alt = this._sensor.getAltitude() ?? 0;
    const mmHg = this._hPa2mmHg(hPa);
    const slp = this._mmHg2SLP(mmHg, alt);
    const bar = Math.round(slp);

    if (this._bar !== bar){
      this._bar = bar;

      // Вывод давления
      if (hPa > 0){
        this._widget && this._widget.setProperty(hmUI.prop.TEXT, `${bar} мм рт.ст.`);
      } else {
        this._widget && this._widget.setProperty(hmUI.prop.TEXT, '--');
      }

      // Изменение зоны давления
      if (this._zone_func){
        const barZone = this._getBarZone(slp);
        if (barZone != this._bar_zone){
          this._bar_zone = barZone;
          this._zone_func(barZone, slp);
        }
      }

    }
  }

  refresh(){
    this._bar = -1;
    this._bar_zone = -1;
    this.update();
  }

  get zone(){
    return this._zone;
  }

  _hPa2mmHg(hPa){
    return hPa * 0.75006;
  }

  _mmHg2SLP(mmHg, alt){
    const t0 = 288.15;
    const t = t0 - 0.0065 * alt;
    return mmHg * Math.pow(t0 / t, 5.255);
  }

  _getBarZone(slp){
    let barZone = 0;
    for (; barZone < this._bar_bound.length; barZone++){
      const k = this._old_bar_zone > 0 ? (barZone < this._old_bar_zone ? -0.5 : 0.5) : 0; // гистерезис
      if (slp < this._bar_bound[barZone] + k) break;
    }
    this._old_bar_zone = barZone;
    return barZone;
  }

  _getBarBound(){
    const barZones = [ // нижние границы зон давления
        1,   // низкое
        745, // пониженное
        755, // нормальное
        765, // повышенное
        775  // высокое
    ];
    return barZones;
  }

}