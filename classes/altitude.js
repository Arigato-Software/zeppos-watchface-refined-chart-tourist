import * as hmUI from '@zos/ui'
import * as hmSensor from '@zos/sensor'

/*
Вывод высоты в м
altitude = new Altitude(params);
params:
  widget - виджет hmUI.widget.TEXT для вывода высоты
  zone_func - callback смены зоны высоты:
    0 - ошибка данных
    1 - ниже уровня моря
    2 - низина
    3 - предгорье
    4 - низкогорье
    5 - горы
    6 - высокогорье
    7 - снежные/ледниковые зоны
  start() - запуск отслеживания высоты
  stop() - остановка отслеживания высоты
  update() - обновление значений
  refresh() - принудительная перерисовка
  zone - текущая зона высоты
*/
export class Altitude{

    constructor(params){
      this._widget = params?.widget ?? null;  
      this._zone_func = params?.zone_func ?? null;

      this._boundaries = this._getBoundaries();
      this._started = false;
      this._alt = -9999;
      this._zone = -1;
      
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
    let alt = this._sensor.getAltitude();
    if (alt) alt = Math.round(alt);

    if (this._alt !== alt){
      this._alt = alt;
      
      // Вывод высоты
      if (alt !== undefined){
        this._widget && this._widget.setProperty(hmUI.prop.TEXT, `${alt} м`);
      } else {
        this._widget && this._widget.setProperty(hmUI.prop.TEXT, '--');
      }

      // Изменение зоны высоты
      if (this._zone_func){
        const zone = (alt !== undefined) ? this._getZone(alt) : 0;
        if (zone != this._zone){
          this._zone = zone;
          this._zone_func(zone, alt);
        }
      }

    }

  }

  refresh(){
    this._alt = -9999;
    this._zone = -1;
    this.update();
  }

  get zone(){
    return this._zone;
  }

  _getZone(alt){
    let zone = 0;
    for (; zone < this._boundaries.length; zone++){
      if (alt < this._boundaries[zone]) return zone;
    }
    return zone;
  }

  _getBoundaries(){
    const zones = [ // нижние границы зон высоты
      -9999, // ниже уровня моря
      0,     // низина
      200,   // предгорье
      500,   // низкогорье
      1000,  // горы
      2000,  // высокогорье
      3000   // снежные/ледниковые зоны
    ];
    return zones;
  }

}