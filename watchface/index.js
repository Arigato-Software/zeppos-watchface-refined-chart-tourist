import * as App from '@zos/app'
import * as hmUI from '@zos/ui'
import * as Router from '@zos/router'
import * as Page from '@zos/page'

import WatchFaceScene from './watchface.js';
import AODScene from './aod.js';
import SettingsScene from './settings.js';

WatchFace({
  onInit(params) {
    // Флаг для предотвращения двух подряд запусков pause (такое происходит в некоторых сценариях ЖЗ циферблата Zepp OS)
    this.paused = true;

    // Определяем тип сцены
    switch (App.getScene()){
      
      case App.SCENE_WATCHFACE: // циферблат
        this.scene = new WatchFaceScene();
        break;
      
      case App.SCENE_AOD: // экран AOD
        this.scene = new AODScene();
        break;
      
      case App.SCENE_SETTINGS: // "синий карандаш" - не создаем сцену
        this.scene = null;
        break;

      case App.SCENE_APP: // приложение с настройками
        this.scene = new SettingsScene(params);

        // Перезапуск страницы приложения по resume
        this.scene.resume = () => {
          this.loading();
          Router.replace({
            url: 'watchface/index',
            params: params,
          });
        }
        break;

      default:
        this.scene = null;
    }
  },

  build() {
    // "Синий карандаш" - перезапускаем сцену с правами SCENE_APP
    if (this.scene === null){
      this.loading();
      Router.replace({url: 'watchface/index'});
      return;
    }

    // build сцены
    this.scene?.build?.();
    
    this.delegate = hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
      // resume сцены
      resume_call: () => {
        if (!this.paused) return;
        this.paused = false;
        this.scene?.resume?.()
      },
      
      // pause сцены
      pause_call: () => {
        if (this.paused) return;
        this.paused = true;
        this.scene?.pause?.()
      },
    });
  },

  // onDestroy сцены
  onDestroy() {
    this.scene?.onDestroy?.();
  },

  // Сообщение о загрузке при смене сцены
  loading(){
    Page.scrollTo({y: 0});

    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: 480,
      h: 480,
      color: 0x000000,
    });

    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0,
      y: 0,
      w: 480,
      h: 480,
      color: 0xffffff,
      text_size: 28,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V,
      text_style: hmUI.text_style.ELLIPSIS,
      text: 'Загрузка...',
    });
  },

})
