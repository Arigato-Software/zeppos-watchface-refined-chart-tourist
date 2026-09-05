import * as FS from '@zos/fs'

/*
Конфигурация приложения / циферблата
const config = new Config();
  setItem(key, val) - задать элемент
  getItem(key, def) - получить значение элемента
  exists(key) - проверить существование элемента
  length - количество элементов
  keys() - список всех ключей элементов
  removeItem(key) - удалить элемент
  clear() - очистить
  save() - сохранение конфигурации в файл
  close() - закрыть и сохранить конфигурацию в файл (обязательно вызвать в конце работы, например, в onDestroy())
  open(path) - открыть другой конфигурационный файл (без предварительного close() не сохранит предыдущий конфиг)
*/
export class Config{
  
  constructor (path = 'config.json'){
    this.open(path);
  }

  setItem(key, val){
    this._config[key] = val;
    this._change = true;
  }

  getItem(key, def){
    return this._config[key] ?? def;
  }

  exists(key){
    return key in this._config;
  }

  get length(){
    return Object.keys(this._config).length;
  }

  keys(){
    return Object.keys(this._config);
  }

  removeItem(key){
    if (this.exists(key)){
      this._change = true;
      return Reflect.deleteProperty(this._config, key);
    }
    return false;
  }

  clear(){
    if (this.length) {
      this._config = Object.create(null);
      this._change = true;
    }
  }

  save(){
    if (this._change){
      this._write();
      this._change = false;
    }
  }

  close(){
    this.save();
    this._config = null;
    this._path = null;
  }

  open(path){
    this._path = path;
    this._change = false;
    this._config = null;
    this._read();
  }

  _read(){
    this._config = Object.create(null);
    const json = FS.readFileSync({
      path: this._path,
      options: {
        encoding: 'utf8',
      },
    });
    if (json){
      try{
        const data = JSON.parse(json);
        Object.assign(this._config, data);
      } catch(e) {
        console.log(e);
      }
    }
  }

  _write(){
    const json = JSON.stringify(this._config);
    FS.writeFileSync({
      path: this._path,
      data: json,
      options: {
        encoding: 'utf8',
      },
    });
  }

}