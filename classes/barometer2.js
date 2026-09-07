import * as hmUI from '@zos/ui'
import * as hmFS from '@zos/fs'
import * as hmSensor from '@zos/sensor'

export const MODE = {
  NONE: 0,
  ALT: 1,
  BAR: 2,
};

export const PERIOD = {
  ONE_DAY: 0,
  FOUR_DAYS: 1,
};

export const INTERVAL_MS = 216000; // 216 сек (400 раз в сутки)
const ALTITUDE_FILENAME = 'altitude.dat';
const PRESSURE_FILENAME = 'pressure.dat';
const ALTITUDE_4_FILENAME = 'altitude_4.dat';
const PRESSURE_4_FILENAME = 'pressure_4.dat';
const CURRENTDAY_FILENAME = 'current_day.txt';
const CHAR_HEIGHT = 66; // размер области графика -4 (т.к. толщина линии 4 пиксела)
const CHART_DIFF = 30; // стандартное отклонение графика
const MS_PER_DAY = 24 * 60 * 60 * 1000; // мс в сутках

export class Barometer2 {

  constructor(params) {
    this._params = {
      chart_widget: null,
      line760_widget: null,
      period: PERIOD.ONE_DAY,
      newDay_func: null,
      show_func: null,
      pressureMode: 1,
      ...params
    };

    this._line760 = false;
    if (this._params.line760_widget) {
      this._line760_x = this._params.line760_widget.getProperty(hmUI.prop.X);
      this._line760_w = this._params.line760_widget.getProperty(hmUI.prop.W);
      this._line760_h = this._params.line760_widget.getProperty(hmUI.prop.H);
    }

    // Создание сенсора
    this._sensor = new hmSensor.Barometer();
    this._started = false;
    this._changeHandler = () => this.update();

    // Запоминаем последнюю известную высоту для расчета линии нормы
    this._oldAlt = Number(this._sensor.getAltitude()) || 0;

    this._mode = MODE.NONE;
    this._loadCurrentDay();

    // Данные
    this._clear();
    this._clear_4();
    this.reload();
    if (this._params.period === PERIOD.FOUR_DAYS) {
      this.reload_4();
    }

  }

  // Запустить слушателя
  start() {
    if (this._started) return;
    this._started = true;
    this._sensor.onChange(this._changeHandler);
  }

  // Остановить слушателя
  stop() {
    if (!this._started) return;
    this._started = false;
    this._sensor.offChange(this._changeHandler);
  }

  // Получить max, min графика
  get maxMin() {
    let max = '';
    let min = '';
    switch (this._mode) {
      case MODE.ALT:
        if (this._params.period === PERIOD.FOUR_DAYS) {
          max = this._altData_4.max;
          min = this._altData_4.min;
        } else {
          max = this._altData.max;
          min = this._altData.min;
        }
        break;
      case MODE.BAR:
        if (this._params.period === PERIOD.FOUR_DAYS) {
          max = Math.ceil(this._barData_4.max / 10);
          min = Math.floor(this._barData_4.min / 10);
        } else {
          max = Math.ceil(this._barData.max / 10);
          min = Math.floor(this._barData.min / 10);
        }
        break;
    }
    return { max, min };
  }

  // Пересчет исторических данных при смене режима давления
  recalculatePressureData(oldMode, newMode) {
    if (oldMode === newMode) return;

    this.reload_4();

    // Вспомогательная функция: поиск ближайшей существующей точки высоты
    const getNearestAlt = (idx, altArray) => {
      // Если точка существует по тому же индексу, используем её
      if (altArray[idx] !== undefined) return altArray[idx];

      // Иначе ищем ближайшую определенную точку влево и вправо
      let left = idx - 1;
      let right = idx + 1;
      const len = altArray.length;

      while (left >= 0 || right < len) {
        if (right < len && altArray[right] !== undefined) return altArray[right];
        if (left >= 0 && altArray[left] !== undefined) return altArray[left];
        left--;
        right++;
      }

      // Fallback на случай полного отсутствия данных о высоте (крайне маловероятно)
      return 0;
    };

    // Вспомогательная функция для обработки пары массивов
    const processArrays = (barArray, altArray) => {
      for (let i = 0; i < barArray.length; i++) {
        const p = barArray[i];
        if (p === undefined) continue;

        // Получаем корректную высоту для данной точки давления
        const alt = getNearestAlt(i, altArray);

        const mmHg = p / 10;
        let newP = mmHg;

        if (oldMode === 0 && newMode === 1) {
          // Было абсолютное, стало приведенное
          newP = this._mmHg2SLP(mmHg, alt);
        } else if (oldMode === 1 && newMode === 0) {
          // Было приведенное, стало абсолютное
          newP = this._slp2mmHg(mmHg, alt);
        }

        barArray[i] = Math.round(newP * 10);
      }
    };

    // Пересчет и сохранение данных за текущий день
    processArrays(this._barData.data, this._altData.data);
    this._saveData(PRESSURE_FILENAME, this._barData.data);

    // Пересчет и сохранение данных архива (4 дня)
    processArrays(this._barData_4.data, this._altData_4.data);
    this._saveData(PRESSURE_4_FILENAME, this._barData_4.data);
  }

  // Перезагрузка суточные данных из файла
  reload() {
    this._altData.noChange = true;
    this._barData.noChange = true;
    this._altData = this._load(ALTITUDE_FILENAME, this._altData);
    this._barData = this._load(PRESSURE_FILENAME, this._barData);
    if (this._altData.data.length !== this._barData.data.length) { // последние точки не совпали
      this._clear();
    }
    // Если отображаем 4 дня — архив визуально изменился
    if (this._params.period === PERIOD.FOUR_DAYS) {
      if (!this._altData.noChange) this._altData_4.prepared = false;
      if (!this._barData.noChange) this._barData_4.prepared = false;
    }
    return !this._altData.noChange || !this._barData.noChange;
  }

  // Перезагрузка данных за 4 дня из файла
  reload_4() {
    if (this._isLoaded_4) return;
    this._altData_4 = this._load(ALTITUDE_4_FILENAME, this._altData_4);
    this._barData_4 = this._load(PRESSURE_4_FILENAME, this._barData_4);
    if (this._altData_4.data.length !== this._barData_4.data.length) { // последние точки не совпали
      this._clear_4();
    }
    this._isLoaded_4 = true;
  }

  setMode(mode, widget = null) {
    if (widget) this._params.chart_widget = widget;

    switch (mode) {
      case MODE.NONE:
        this._params.line760_widget && this._params.line760_widget.setProperty(hmUI.prop.VISIBLE, false);
        break;
      case MODE.ALT:
        this._params.line760_widget && this._params.line760_widget.setProperty(hmUI.prop.VISIBLE, false);
        break;
      case MODE.BAR:
        this._params.line760_widget && this._params.line760_widget.setProperty(hmUI.prop.VISIBLE, this._line760);
        break;
    }

    if (this._mode != mode) {
      this._mode = mode;
      this.showGraph(true);
    }
  }

  // Визуализация графиков
  showGraph(show = false) {
    if (this._mode === MODE.NONE || !this._params.chart_widget) return;

    let data = null;
    let curData = null;

    switch (this._mode) {
      case MODE.ALT:
        if (this._params.period === PERIOD.FOUR_DAYS) {
          data = this._altData_4;
          curData = this._altData;
        } else {
          data = this._altData;
        }
        break;

      case MODE.BAR:
        if (this._params.period === PERIOD.FOUR_DAYS) {
          data = this._barData_4;
          curData = this._barData;
        } else {
          data = this._barData;
        }
        break;
    }

    // Если данные обновились
    if (!data.prepared) {
      show = true;

      // Для периода в 4 дня добавляем сегодняшние данные к архиву
      if (this._params.period === PERIOD.FOUR_DAYS) {
        this._archiveDay(curData, data, 300);
      }

      // Рисуем линию 760 мм рт.ст.
      if (this._mode === MODE.BAR) {
        if (this._params.line760_widget) {
          const y760 = this._getPressure760Y(data.max, data.min);
          if (y760 >= 0) {
            const y = y760 + (this._params.chart_widget?.getProperty(hmUI.prop.Y) ?? 0);
            this._params.line760_widget.setProperty(hmUI.prop.MORE, {
              x: this._line760_x,
              y,
              w: this._line760_w,
              h: this._line760_h,
            });
            this._line760 = true;
          } else {
            this._line760 = false;
          }
          this._params.line760_widget.setProperty(hmUI.prop.VISIBLE, this._line760);
        }
      }

      // Пересчет в экранные координаты
      this._prepareData(data);
    }

    if (show) {
      // Отрисовка графика
      this._params.chart_widget.clear();
      if (data.prepare.length > 0) {
        this._params.chart_widget.addLine({
          data: data.prepare,
          count: data.prepare.length,
        });
      }

      // Callback
      this._params.show_func?.();
    }

  }

  // Очистка графиков
  clearGraph() {
    this._params.chart_widget && this._params.chart_widget.clear();
    if (this._mode === MODE.BAR) {
      this._params.line760_widget && this._params.line760_widget.setProperty(hmUI.prop.VISIBLE, false);
      this._line760 = false;
    }
  }

  // Слушатель изменений датчика
  update(show = false) {
    const alt = this._sensor.getAltitude();
    const hPa = this._sensor.getAirPressure();

    if (alt !== undefined && hPa !== undefined) { // датчик исправен
      this._oldAlt = alt;

      if (this._process(alt, hPa)) {
        show = true; // были изменения в данных
      }

    }

    // Визуализация графиков
    if (show) {
      this.showGraph();
    }
  }

  // Получить текущий день
  getCurrentDay() {
    return new Date().setHours(0, 0, 0, 0);
  }

  // Загрузить текущий день из файла
  _loadCurrentDay() {
    this._currentDay = hmFS.readFileSync({
      path: CURRENTDAY_FILENAME,
      options: {
        encoding: 'utf8',
      },
    });
    this._currentDay = this._currentDay ? Number(this._currentDay) : -1;
  }

  // Координата y линии нормального давления
  _getPressure760Y(max, min) {
    const range = max - min;
    if (range <= 0) return -1;

    let targetMmHg10;

    if (this._params.pressureMode === 1) {
      // Приведенное к уровню моря: фиксированная норма
      targetMmHg10 = 7600;
    } else {
      // Абсолютное: вычисляем норму для текущей высоты через обратную функцию
      const normalMmHg = this._slp2mmHg(760, this._oldAlt);
      targetMmHg10 = Math.round(normalMmHg * 10);
    }

    const y = Math.round((max - targetMmHg10) * (CHAR_HEIGHT - 1) / range) + 1; // почему +1 я не знаю, но без него не попадало в середину графика

    return (y >= 0 && y < CHAR_HEIGHT) ? y : -1;
  }

  // Преобразование данных в координаты для графика
  _prepareData(data) {
    const range = data.max - data.min;
    data.prepared = true;
    if (range <= 0) {
      data.prepare = [];
      return;
    }

    let start = 0;
    if (range !== data.range) {
      data.prepare = [];
      data.range = range;
    } else {
      if (data.prepare.length > 0) {
        start = data.prepare[data.prepare.length - 1].x;
        data.prepare.pop(); // последнюю точку удалим, чтобы пересчитать
      }
    }

    const scale = (CHAR_HEIGHT - 1) / range;

    let last1 = data.prepare[start - 1]?.y ?? null; // последняя записанная экранная точка
    let last2 = null; // предпоследняя экранная точка

    for (let x = start; x < data.data.length; x++) {
      const val = data.data[x];
      if (val === undefined) continue;

      const y = Math.round((data.max - val) * scale) + 2; // 2 - смещение, чтобы не выходил за границу области

      // Проверка плато: 3 одинаковых экранных точки подряд
      if (last1 === y && last2 === y) {
        data.prepare.pop();
      } else {
        last2 = last1;
      }
      last1 = y;

      data.prepare.push({ x, y });
    }
  }

  // Обработка данных с датчика
  _process(alt, hPa) {
    const x = this._getDataNum(Date.now());
    let lastX = this._altData.data.length - 1;

    // Проверка нового дня
    // Проверка обязательно до if (lastX != x), так как новый день может сразу попасть в точку lastX, если пропущено начало дня
    const newDay = this._checkNewDay();

    if (lastX != x || newDay) { // новая запись данных
      const mmHg = this._hPa2mmHg(hPa);
      const slp = this._params.pressureMode === 1 ? this._mmHg2SLP(mmHg, alt) : mmHg;

      if (newDay) {
        this._newDay(x, alt, slp);
        lastX = -1; // чтобы точно добавить текущую запись
      }

      // Если время вдруг отмоталось назад
      if (x < lastX) {
        this._truncate(x);
      }

      // Добавление новой порции данных
      this._addPoint(x, alt, slp);

      return true;
    }

    return false;
  }

  // Переход на новый день
  _newDay(x, alt, slp) {

    // Удаление файлов с данными за прошлый день
    hmFS.rmSync({ path: ALTITUDE_FILENAME });
    hmFS.rmSync({ path: PRESSURE_FILENAME });

    let alt0 = alt;
    let slp0 = slp;

    if (this._oldDay !== -1) { // если есть данные за ушедший день

      // Сколько прошло дней с последних данных (например, часы были выключены)
      const dayDiff = Math.max(Math.floor((this._currentDay - this._oldDay) / MS_PER_DAY), 0);

      // Загружаем архив 4 дней
      if (dayDiff < 3) {
        this.reload_4();
      } else { // если архив уже неактуален, то удаляем
        this._clear_4();
      }

      if (dayDiff < 4) {
        // Если пропустили запись в 00:00
        if (x > 0) {
          let lastX = this._altData.data.length - 1;
          let lastAlt = null;
          let lastBar = null;
          if (lastX >= 0) { // есть записи за прошлый день
            lastAlt = this._altData.data[lastX];
            lastBar = this._barData.data[lastX] / 10; // делим на 10, так как в массиве давление * 10
            lastX -= 400;
          } else {
            lastX = this._altData_4.data.length - 1;
            if (lastX >= 0) { // есть записи в архиве
              lastAlt = this._altData_4.data[lastX];
              lastBar = this._barData_4.data[lastX] / 10; // делим на 10, так как в массиве давление * 10
              lastX = 4 * (lastX - 300); // архив разрежен в 4 раза
            }
          }
          lastX -= 400 * (dayDiff - 1); // корректируем индекс на случай пропуска дней
          if (lastAlt !== null && lastX != 0) {
            alt0 = this._interpolate(lastX, lastAlt, x, alt, 0);
            slp0 = this._interpolate(lastX, lastBar, x, slp, 0);
          }
        }

        // Перенос в архив текущих данных
        this._archiveDay(this._altData, this._altData_4, 300);
        this._archiveDay(this._barData, this._barData_4, 300);

        // Добавляем полуночные точки, если были пропущены дни
        this._fillMidnights(this._altData_4.data, Math.round(alt0));
        this._fillMidnights(this._barData_4.data, Math.round(slp0 * 10));

        // Сдвигаем архив
        this._altData_4 = this._shift(this._altData_4.data, 100 * dayDiff);
        this._barData_4 = this._shift(this._barData_4.data, 100 * dayDiff);
      }

      // Сохраняем архив
      const altMaxMin_4 = this._saveData(ALTITUDE_4_FILENAME, this._altData_4.data);
      const barMaxMin_4 = this._saveData(PRESSURE_4_FILENAME, this._barData_4.data);

      // Переопределяем max, min, mtime, size
      this._altData_4 = {
        ...this._altData_4,
        ...altMaxMin_4,
      };
      this._barData_4 = {
        ...this._barData_4,
        ...barMaxMin_4,
      };

    } else { // нет данных за прошедший день - очищаем всю информацию
      this._clear_4();
      hmFS.rmSync({ path: ALTITUDE_4_FILENAME });
      hmFS.rmSync({ path: PRESSURE_4_FILENAME });
    }

    // Очищаем текущий день и добавляем нулевую точку (если надо)
    this._clear();
    if (x > 0) {
      this._addPoint(0, alt0, slp0);
    }
  }

  // Добавление пропущенных точек в 00:00 каждого дня архива
  _fillMidnights(data, rightPoint = null) {
    const keyIndices = [100, 200, 300];
    for (const keyIdx of keyIndices) {
      if (data[keyIdx] !== undefined) continue;

      let leftIdx = -1;
      let leftVal = 0;
      for (let i = keyIdx - 1; i >= 0; i--) {
        if (data[i] !== undefined) {
          leftIdx = i;
          leftVal = data[i];
          break;
        }
      }

      let rightIdx = -1;
      let rightVal = 0;
      for (let i = keyIdx + 1; i < data.length; i++) {
        if (data[i] !== undefined) {
          rightIdx = i;
          rightVal = data[i];
          break;
        }
      }

      if (rightIdx === -1 && rightPoint) {
        rightIdx = 400;
        rightVal = rightPoint;
      }

      if (leftIdx >= 0 && rightIdx >= 0) {
        data[keyIdx] = Math.round(this._interpolate(
          leftIdx, leftVal,
          rightIdx, rightVal,
          keyIdx
        ));
      } else if (leftIdx >= 0) {
        data[keyIdx] = leftVal;
      }
    }
  }

  // Сдвиг данных влево
  _shift(data, shift = 100) {
    const arr = [];
    let max = -Infinity;
    let min = Infinity;
    let first = true;

    for (let i = shift; i < data.length; i++) {
      const val = data[i];
      if (val === undefined) continue;
      const x = i - shift;
      arr[x] = val;
      if (first) {
        first = false;
        max = val + CHART_DIFF;
        min = val - CHART_DIFF;
      } else {
        if (val > max) max = val;
        if (val < min) min = val;
      }
    }

    return {
      data: arr,
      max,
      min,
      range: undefined,
      prepare: [],
      prepared: false,
    };
  }

  // Перенос текущих данных в архив (разрежение ×4)
  _archiveDay(source, dest, startIndex = 300) {
    const start = Math.max(0, dest.data.length - startIndex - 1); // добавляем в архив только новые точки
    const stop = Math.ceil(source.data.length / 4); // проходим только по существующим точкам

    for (let i = start; i < stop; i++) {
      let sum = 0;
      let cnt = 0;
      const base = i * 4;

      for (let j = 0; j < 4; j++) {
        const x = base + j;
        const val = source.data[x];
        if (val !== undefined) {
          sum += val;
          cnt++;
        }
      }

      if (cnt === 0) continue;

      const idx = startIndex + i;
      const val = Math.round(sum / cnt);

      // записываем текущую точку
      dest.data[idx] = val;
    }

    dest.max = Math.max(dest.max, source.max);
    dest.min = Math.min(dest.min, source.min);
    dest.prepared = false;
  }

  // Обрезать данные
  _truncate(x) {

    // Обрезаем массивы
    this._altData.data.length = x;
    this._barData.data.length = x;

    // Перезаписываем данные
    const altMaxMin = this._saveData(ALTITUDE_FILENAME, this._altData.data);
    const barMaxMin = this._saveData(PRESSURE_FILENAME, this._barData.data);

    // Переопределяем max, min, mtime, size
    this._altData = {
      ...this._altData,
      range: undefined,
      prepared: false,
      ...altMaxMin,
    };
    this._barData = {
      ...this._barData,
      range: undefined,
      prepared: false,
      ...barMaxMin,
    };

    // Перезагружаем архив
    this._clear_4();
    this.reload_4();
  }

  // Сжатие данные (оптимизация горизонтальных плато до 2-х точек)
  _compressData(data) {
    let last1 = { idx: null, val: null };  // последняя записанная точка
    let last2 = { idx: null, val: null };  // предпоследняя точка

    let count = 0;

    for (let idx = 0; idx < data.length; idx++) {
      const val = data[idx];
      if (val === undefined) continue;

      if (last1.val === val && last2.val === val && last1.idx % 100 !== 0) { // idx % 100 - ключевые точки начала дня
        delete data[last1.idx]; // удаляем среднюю точку плато
      } else {
        last2 = last1;
        count++;
      }
      last1 = { idx, val };
    }

    return count;
  }

  // Сохранить данные целиком
  _saveData(fileName, data) {
    let min = Infinity;
    let max = -Infinity;
    let first = true;

    // Сжимаем данные (срезаем плато)
    const count = this._compressData(data);

    const buffer = new ArrayBuffer(count * 4); // Каждый элемент — 4 байта
    const view = new DataView(buffer);

    let offset = 0;
    for (let x = 0; x < data.length; x++) {
      const val = data[x];
      if (val === undefined) continue;

      // Записываем значения в DataView
      view.setUint16(offset, x, true);
      view.setInt16(offset + 2, val, true);

      if (first) {
        first = false;
        max = val + CHART_DIFF;
        min = val - CHART_DIFF;
      } else {
        if (val > max) max = val;
        if (val < min) min = val;
      }
      offset += 4;
    }

    hmFS.writeFileSync({
      path: fileName,
      data: buffer,
    });

    const stat = hmFS.statSync({ path: fileName });
    const mtime = stat?.mtimeMs ?? -1;
    const size = stat?.size ?? -1;
    return { max, min, mtime, size };
  }

  // Проверка смены дня
  _checkNewDay() {
    const today = this.getCurrentDay();
    if (this._currentDay !== today) {
      // Callback нового дня
      this._params.newDay_func?.();

      this._oldDay = this._currentDay;
      this._loadCurrentDay();

      if (this._currentDay !== today) {
        this._currentDay = today;
        this._saveCurrentDay();
        return true;
      } else { // смена дня произошла в AOD
        this._altData.prepare = [];
        this._barData.prepare = [];
        this._clear_4();
        if (this._params.period === PERIOD.FOUR_DAYS) {
          this.reload_4();
        }
      }
    }

    return false;
  }

  // Сохранить текущий день в файл
  _saveCurrentDay() {
    hmFS.writeFileSync({
      path: CURRENTDAY_FILENAME,
      data: this._currentDay.toString(),
      options: {
        encoding: 'utf8',
      },
    });
  }

  // Записать показания в массив с данными
  _addPoint(x, alt, slp) {
    const slp_10 = Math.round(slp * 10); // храним давление * 10
    const altR = Math.round(alt);
    const len = this._altData.data.length;

    this._altData.data[x] = altR;
    this._barData.data[x] = slp_10;
    const altData = this._save(ALTITUDE_FILENAME, x, altR);
    const barData = this._save(PRESSURE_FILENAME, x, slp_10);

    this._altData = {
      ...this._altData,
      prepared: false,
      ...altData,
    }
    this._barData = {
      ...this._barData,
      prepared: false,
      ...barData,
    }

    this._updateMaxMin(len, altR, slp_10);

    // Если отображаем 4 дня — архив визуально изменился
    if (this._params.period === PERIOD.FOUR_DAYS) {
      this._altData_4.prepared = false;
      this._barData_4.prepared = false;
    }
  }

  // Обновление max и min данных
  _updateMaxMin(len, alt, slp_10) {
    if (len > 0) {
      this._altData.max = Math.max(this._altData.max, alt);
      this._altData.min = Math.min(this._altData.min, alt);
      this._barData.max = Math.max(this._barData.max, slp_10);
      this._barData.min = Math.min(this._barData.min, slp_10);
    } else {
      this._altData.max = alt + CHART_DIFF;
      this._altData.min = alt - CHART_DIFF;
      this._barData.max = slp_10 + CHART_DIFF;
      this._barData.min = slp_10 - CHART_DIFF;
    }
  }

  // В мм рт.ст.
  _hPa2mmHg(hPa) {
    return hPa * 0.75006;
  }

  // Коэффициент приведения давления для заданной высоты
  _getPressureFactor(alt) {
    const t0 = 288.15;
    const t = t0 - 0.0065 * alt;
    return Math.pow(t0 / t, 5.255);
  }

  // Приведение атмосферного давления к уровню моря
  _mmHg2SLP(mmHg, alt) {
    return mmHg * this._getPressureFactor(alt);
  }

  // Обратное приведение: вычисление абсолютного давления на заданной высоте, 
  // соответствующего заданному давлению на уровне моря (SLP)
  _slp2mmHg(slp, alt) {
    return slp / this._getPressureFactor(alt);
  }

  // Получить номар записи (0-399) по времени
  _getDataNum(dt) {
    const dayStart = new Date(dt).setHours(0, 0, 0, 0);
    return Math.floor((dt - dayStart) / INTERVAL_MS);
  }

  // Линейная интерполяция
  _interpolate(x1, y1, x2, y2, x) {
    return y1 + (y2 - y1) * (x - x1) / (x2 - x1);
  }

  // Загрузка данных из файла
  _load(fileName, current) {

    // Чтение данных из файла
    const stat = hmFS.statSync({ path: fileName });
    if (!stat || (stat.size === current.size && stat.mtimeMs === current.mtime)) { // файл не существует, пустой или не менялся
      return current;
    }

    const size = stat.size;
    const fd = hmFS.openSync({
      path: fileName,
      flag: hmFS.O_RDONLY,
    });
    const buffer = new ArrayBuffer(size);
    const count = hmFS.readSync({ fd, buffer });
    hmFS.closeSync(fd);

    const len = Math.min(size, count);

    if (len === 0 || len % 4 !== 0) {
      return current; // файл поврежден или пустой
    }

    // Запись данных в массив
    const arr = [];
    let max = -Infinity;
    let min = Infinity;
    const view = new DataView(buffer);

    let first = true;
    for (let offset = 0; offset < len; offset += 4) {
      const x = view.getUint16(offset, true);
      const val = view.getInt16(offset + 2, true);
      arr[x] = val;
      if (first) {
        first = false;
        max = val + CHART_DIFF;
        min = val - CHART_DIFF;
      } else {
        if (val > max) max = val;
        if (val < min) min = val;
      }
    }

    return {
      data: arr,
      max,
      min,
      range: current.range,
      mtime: stat.mtimeMs ?? -1,
      size: stat.size ?? -1,
      prepare: current.prepare,
      prepared: false,
    };

  }

  // Сохранение данных в файл
  _save(fileName, x, val) {

    // Подготовка данных для записи в файл
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint16(0, x, true);
    view.setInt16(2, val, true);

    // Запись в файл
    const fd = hmFS.openSync({
      path: fileName,
      flag: hmFS.O_WRONLY | hmFS.O_APPEND | hmFS.O_CREAT,
    });
    hmFS.writeSync({ fd, buffer });
    hmFS.closeSync(fd);

    // Считываем время изменения и размера файла
    const stat = hmFS.statSync({ path: fileName });
    const mtime = stat?.mtimeMs ?? -1;
    const size = stat?.size ?? -1;
    return { mtime, size };

  }

  // Очистка данных за сутки
  _clear() {
    this._altData = {
      data: [],
      max: CHART_DIFF,
      min: -CHART_DIFF,
      range: undefined,
      mtime: -1,
      size: -1,
      prepare: [],
      prepared: false,
    };

    // Базовое значение для центра графика давления
    const baseMmHg10 = this._params.pressureMode === 1
      ? 7600
      : Math.round(this._slp2mmHg(760, this._oldAlt) * 10);

    this._barData = {
      data: [],
      max: baseMmHg10 + CHART_DIFF,
      min: baseMmHg10 - CHART_DIFF,
      range: undefined,
      mtime: -1,
      size: -1,
      prepare: [],
      prepared: false,
    };
  }

  // Очистка данных за 4 дня
  _clear_4() {
    this._isLoaded_4 = false;
    this._altData_4 = {
      data: [],
      max: -Infinity,
      min: Infinity,
      range: undefined,
      prepare: [],
      prepared: false,
    };
    this._barData_4 = {
      data: [],
      max: -Infinity,
      min: Infinity,
      range: undefined,
      prepare: [],
      prepared: false,
    };
  }

}