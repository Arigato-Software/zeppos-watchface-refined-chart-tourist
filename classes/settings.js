import * as hmUI from '@zos/ui'
import * as Router from '@zos/router'
import * as Interaction from '@zos/interaction'
import * as Page from '@zos/page'

export class Settings {
    
    constructor(param){
        this._layout = param?.layout ?? {};
        this._y = param?.y ?? 0;
        this.keyControl = true;
    }

    title(param){
        this._y += this._layout.title.y;
        hmUI.createWidget(hmUI.widget.TEXT, {
            ...this._layout.title,
            y: this._y,
            text: param?.text ?? '',
        });
        this._y += this._layout.title.h;
    }

    addHint(param){
        this.addText({
            text: param?.text,
            layout: this._layout.hint,
        });
    }

    addLink(param){
        hmUI.createWidget(hmUI.widget.TEXT, {
            ...this._layout.link_text,
            y: this._layout.link_text.y + this._y,
            text: param?.text ?? '',
        });
        hmUI.createWidget(hmUI.widget.IMG, {
            ...this._layout.link_img,
            y: this._layout.link_img.y + this._y,
        });
        this.addButton({
            click_func: param?.click_func ?? null,
        });
    }

    addRadioGroup(param){
        const len = param?.items?.length ?? 0;
        const h = this._layout.radio_group.h * len;
        const radioGroup = hmUI.createWidget(hmUI.widget.RADIO_GROUP, {
            ...this._layout.radio_group,
            y: this._layout.radio_group.y + this._y,
            h: h,
        });

        let y = 0;
        const buttons = [];
        for (let i = 0; i < len; ++i){
            buttons[i] = radioGroup.createWidget(hmUI.widget.STATE_BUTTON, {
                ...this._layout.radio_item,
                y: this._layout.radio_item.y + y,
            });
            hmUI.createWidget(hmUI.widget.TEXT, {
                ...this._layout.radio_text,
                y: this._layout.radio_text.y + this._y,
                text: param.items[i],
            });
            this.addButton({
                click_func: () => {
                    radioGroup.setProperty(hmUI.prop.CHECKED, buttons[i]);
                    param?.click_func?.(i);
                },
            });
            y += this._layout.radio_group.h;
        }
        
        const init = Math.max(Math.min(param?.init ?? 0, buttons.length - 1), 0);
        radioGroup.setProperty(hmUI.prop.INIT, buttons[init]);
    }

    addCheckboxGroup(param){
        const len = param?.items?.length ?? 0;
        const h = this._layout.checkbox_group.h * len;
        const checkboxGroup = hmUI.createWidget(hmUI.widget.CHECKBOX_GROUP, {
            ...this._layout.checkbox_group,
            y: this._layout.checkbox_group.y + this._y,
            h: h,
        });

        let y = 0;
        const buttons = [];
        const checkeds = [];
        for (let i = 0; i < len; ++i){
            checkeds[i] = param?.init?.[i] ?? false;
            buttons[i] = checkboxGroup.createWidget(hmUI.widget.STATE_BUTTON, {
                ...this._layout.checkbox_item,
                y: this._layout.checkbox_item.y + y,
            });
            hmUI.createWidget(hmUI.widget.TEXT, {
                ...this._layout.checkbox_text,
                y: this._layout.checkbox_text.y + this._y,
                text: param.items[i],
            });
            this.addButton({
                click_func: () => {
                    const checked = !checkeds[i];
                    checkeds[i] = checked;
                    if (checked){
                        checkboxGroup.setProperty(hmUI.prop.CHECKED, buttons[i]);
                    } else {
                        checkboxGroup.setProperty(hmUI.prop.UNCHECKED, buttons[i]);
                    }
                    param?.click_func?.(i, checked);
                },
            });
            y += this._layout.checkbox_group.h;
        }
        
        checkboxGroup.setProperty(hmUI.prop.INIT, buttons[0]);
        for (let i = 0; i < len; ++i){
            if (checkeds[i]){
                checkboxGroup.setProperty(hmUI.prop.CHECKED, buttons[i]);
            } else {
                checkboxGroup.setProperty(hmUI.prop.UNCHECKED, buttons[i]);
            }
        }
    }

    addHelpButton(param){
        const img = hmUI.createWidget(hmUI.widget.IMG, {
            ...this._layout.help,
            y: this._layout.help.y + this._y,
        });
        this.addButton({
            focus_func: () => {
                img.setProperty(hmUI.prop.MORE, {src: this._layout.help_focus.src});
                return false;
            },
            unfocus_func: () => {
                img.setProperty(hmUI.prop.MORE, {src: this._layout.help.src});
                return false;
            },
            ...param
        });
    }

    addAbout(param){
        if (param?.title){
            this.addText({
                text: param.title,
                layout: this._layout.about_title,
            });
        }
        if (param?.text){
            this.addText({
                text: param.text,
                layout: this._layout.about_text,
            });
        }
    }

    addButton(param){
        const button = hmUI.createWidget(hmUI.widget.BUTTON, {
            ...this._layout.button,
            y: this._layout.button.y + this._y,
            click_func: () => {
                param?.click_func?.();
            },
        });
        button.setAlpha(0);
        button.addEventListener(hmUI.event.CLICK_DOWN, () => {
            if (param?.focus_func?.() ?? true){
                button.setAlpha(100);
            }
        });
        button.addEventListener(hmUI.event.CLICK_UP, () => {
            if (param?.unfocus_func?.() ?? true){
                button.setAlpha(0);
            }
        });
        button.addEventListener(hmUI.event.MOVE_OUT, () => {
            if (param?.unfocus_func?.() ?? true){
                button.setAlpha(0);
            }
        });
        this._y += this._layout.button.h;
    }

    addIndent(){
        this._y += this._layout.indent.h;
    }

    addFooter(){
        hmUI.createWidget(hmUI.widget.TEXT, {
            ...this._layout.footer,
            y: this._layout.footer.y + this._y,
        });
        this._y += this._layout.footer.h;
    }

    showDialog(param){
        const dialog = Interaction.createModal({
            title: param?.title ?? '',
            subtitle: param?.text ?? '',
            autoHide: false,
            onClick: (keyObj) => {
                const { type } = keyObj
                if (type === Interaction.MODAL_CONFIRM) {
                    param?.ok_func?.();
                    dialog.show(false);
                    this.goHome();
                } else {
                    Router.back();
                }
                this.keyControl = true;
            },
        });
        this.keyControl = false;
        dialog.show(true);
    }

    scrollBar(){
        this.scrollWidget = hmUI.createWidget(hmUI.widget.PAGE_SCROLLBAR);
    }

    addText(param){
        if (param?.text){
            const y = param.layout.y + this._y;
            const info = hmUI.getTextLayout(param.text, {
                text_size: param.layout.text_size,
                text_width: param.layout.w,
                wrapped: param.layout.text_style === hmUI.text_style.WRAP ? 1 : 0,
            });
            hmUI.createWidget(hmUI.widget.TEXT, {
                ...param.layout,
                y: y,
                h: info.height,
                text: param.text,
            });
            this._y = y + info.height;
        }
    }

    backButton(){
        const keys = [
            Interaction.KEY_BACK,
            Interaction.KEY_HOME,
            Interaction.KEY_SELECT,
            Interaction.KEY_SHORTCUT,
        ];
        Interaction.onKey({
            callback: (key, keyEvent) => {
                if (this.keyControl && keyEvent === Interaction.KEY_EVENT_CLICK && keys.includes(key)){
                    this.goHome();
                    return true;
                }
                return false;
            },
        });
        Interaction.onGesture({
            callback: (event) => {
                if (this.keyControl && event === Interaction.GESTURE_RIGHT){
                    this.goHome();
                    return true;
                }
                return false;
            },
        });
    }

    homeButton(){
        const keys = [
            Interaction.KEY_HOME,
            Interaction.KEY_SELECT,
            Interaction.KEY_SHORTCUT
        ];
        Interaction.onKey({
            callback: (key, keyEvent) => {
                if (this.keyControl && keyEvent === Interaction.KEY_EVENT_CLICK && keys.includes(key)){
                    this.goHome();
                    return true;
                }
                return false;
            },
        });
    }

    openPage(page, url = 'watchface/index'){
        Router.push({
            url: url,
            params: page,
        });
    }

    goHome(){
        this.scrollWidget && hmUI.deleteWidget(this.scrollWidget);
        this.scrollWidget = undefined;
        Page.scrollTo({y: 0});

        hmUI.createWidget(hmUI.widget.FILL_RECT, this._layout.saving_rect);
        hmUI.createWidget(hmUI.widget.TEXT, this._layout.saving_text);
        
        Router.home();
    }

}