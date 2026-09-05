import * as hmUI from '@zos/ui'

const ELEM_HEIGHT = 112;

export default {
    settings: {
        title: {
            x: 86,
            y: 64,
            w: 308,
            h: ELEM_HEIGHT,
            color: 0xffffff,
            text_size: 38,
            align_h: hmUI.align.CENTER_H,
            align_v: hmUI.align.TOP,
            text_style: hmUI.text_style.WRAP,
        },

        hint: {
            x: 40,
            y: 0,
            w: 400,
            h: 0,
            color: 0xb0b0b0,
            text_size: 32,
            align_h: hmUI.align.CENTER_H,
            align_v: hmUI.align.TOP,
            text_style: hmUI.text_style.WRAP,
        },

        link_text: {
            x: 40,
            y: 0,
            w: 332,
            h: ELEM_HEIGHT,
            color: 0xffffff,
            text_size: 38,
            align_h: hmUI.align.LEFT,
            align_v: hmUI.align.CENTER_V,
            text_style: hmUI.text_style.NONE,
        },
        link_img: {
            x: 389,
            y: 28,
            src: 'list_arrow.png',
        },

        radio_group: {
            x: 0,
            y: 0,
            w: 480,
            h: ELEM_HEIGHT,
            select_src: 'selected.png',
            unselect_src: 'unselected.png',
        },
        radio_item: {
            x: 37,
            y: 24,
            w: 64,
            h: 64,
        },
        radio_text: {
            x: 120,
            y: 0,
            w: 320,
            h: ELEM_HEIGHT,
            color: 0xffffff,
            text_size: 38,
            align_h: hmUI.align.LEFT,
            align_v: hmUI.align.CENTER_V,
            text_style: hmUI.text_style.NONE,
        },

        checkbox_group: {
            x: 0,
            y: 0,
            w: 480,
            h: ELEM_HEIGHT,
            select_src: 'checked.png',
            unselect_src: 'unchecked.png',
        },
        checkbox_item: {
            x: 37,
            y: 24,
            w: 64,
            h: 64,
        },
        checkbox_text: {
            x: 120,
            y: 0,
            w: 320,
            h: ELEM_HEIGHT,
            color: 0xffffff,
            text_size: 38,
            align_h: hmUI.align.LEFT,
            align_v: hmUI.align.CENTER_V,
            text_style: hmUI.text_style.NONE,
        },

        help: {
            x: 210,
            y: 26,
            src: 'help.png',
        },
        help_focus: {
            src: 'help_focus.png',
        },

        about_title: {
            x: 40,
            y: 96,
            w: 400,
            h: 0,
            color: 0xffffff,
            text_size: 38,
            align_h: hmUI.align.CENTER_H,
            align_v: hmUI.align.TOP,
            text_style: hmUI.text_style.WRAP,
        },
        about_text: {
            x: 40,
            y: 0,
            w: 400,
            h: 0,
            color: 0xb0b0b0,
            text_size: 34,
            align_h: hmUI.align.CENTER_H,
            align_v: hmUI.align.TOP,
            text_style: hmUI.text_style.WRAP,
        },

        button: {
            x: 0,
            y: 0,
            w: 480,
            h: ELEM_HEIGHT,
            normal_color: 0x000000,
            press_color: 0x000000,
            text: '',
        },

        indent: {
            h: ELEM_HEIGHT / 4,
        },

        footer: {
            x: 0,
            y: 0,
            w: 480,
            h: 160,
            color: 0x000000,
            text: ''
        },

        saving_rect: {
            x: 0,
            y: 0,
            w: 480,
            h: 480,
            color: 0x000000,
        },
        saving_text: {
            x: 0,
            y: 0,
            w: 480,
            h: 480,
            color: 0xffffff,
            text_size: 28,
            align_h: hmUI.align.CENTER_H,
            align_v: hmUI.align.CENTER_V,
            text_style: hmUI.text_style.ELLIPSIS,
            text: 'Сохранение...',
        },
    },
    
}