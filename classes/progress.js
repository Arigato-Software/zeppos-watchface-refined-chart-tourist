import * as hmUI from '@zos/ui'

/*
Класс отображения шкалы прогресса
stepProgress = new Progress(params);
params:
  sensor - сенсор с указанием цели (например, sensor.Step для шагов)
  widget - виджет hmUI.widget.IMG для отображения прогресса
  prefix - префикс имени картонок (например: 'step_')
  count - количество картинок (индексация с 1, например: step_1.png, step_2.png и т.д.)
  complete_func - callback достижения цели
  reset_func - callback сброса показателей (например, новый день или цели увеличены)
start() - запуск шкалы прогресса
stop() - остановка шкалы прогресса
update() - обновление шкалы прогресса
refresh() - принудительная перерисовка шкалы прогресса
*/
export class Progress{
  
  constructor(params){
    this._params = {
      sensor: null,
      widget: null,
      prefix: '',
      count: 0,      
      complete_func: null,
      reset_func: null,
      ...params
    };
    this._level = -1;
    this._started = false;
    this._completed = false;
    this._changeHandler = () => this.update();
  }
  
  start(){
    if (this._started) return;
    this._started = true;
    this._params.sensor.onChange(this._changeHandler);
  }
  
  stop(){
    if (!this._started) return;
    this._started = false;
    this._params.sensor.offChange(this._changeHandler);
  }
  
  update(){
    const level = this._getLevel();
    if (level != this._level){
      this._level = level;
      this._displayLevel();
      this._checkCompletion();
    }
  }

  refresh(){
    this._level = -1;
    this.update();
  }
  
  _getLevel(){
    const current = this._params.sensor.getCurrent();
    const target = this._params.sensor.getTarget();
    const count = this._params.count;
    if (current >= target) return count;
    return Math.floor(count * current / target);
  }

  _displayLevel(){
    if (this._level > 0){
      const src = this._getSrc();
      this._params.widget.setProperty(hmUI.prop.MORE, {src: src});
      this._params.widget.setProperty(hmUI.prop.VISIBLE, true);
    } else {
      this._params.widget.setProperty(hmUI.prop.VISIBLE, false);
    }
  }

  _getSrc(){
    return `${this._params.prefix}${this._level}.png`;
  }
  
  _checkCompletion(){
    if (this._level < this._params.count){
      if (this._completed){
        this._completed = false;
        this._params.reset_func?.(this._params.sensor);
      }
    } else {
      if (!this._completed){
        this._completed = true;
        this._params.complete_func?.(this._params.sensor);
      }
    }
  }
 
}