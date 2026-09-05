import * as hmUI from '@zos/ui'

export default {
    // Задник
    background: {
        heart_alarm: {
            x: 105,
            y: 32,
            src: 'animation/hr_12.png',
        },
    },

    // Время
    time:{
        clock: {
            hour_startX: 32,
            hour_startY: 134,
            hour_array: ["aod_0.png","aod_1.png","aod_2.png","aod_3.png","aod_4.png","aod_5.png","aod_6.png","aod_7.png","aod_8.png","aod_9.png"],
            hour_zero: 1,
            hour_space: 0,
            hour_angle: 0,
            hour_unit_sc: 'aod_dot.png',
            hour_unit_tc: 'aod_dot.png',
            hour_unit_en: 'aod_dot.png',
            hour_align: hmUI.align.LEFT,

            minute_startX: 223,
            minute_startY: 134,
            minute_array: ["aod_0.png","aod_1.png","aod_2.png","aod_3.png","aod_4.png","aod_5.png","aod_6.png","aod_7.png","aod_8.png","aod_9.png"],
            minute_zero: 1,
            minute_space: 0,
            minute_angle: 0,
            minute_follow: 0,
            minute_align: hmUI.align.LEFT,

            show_level: hmUI.show_level.ONLY_AOD,
        },
    },

}