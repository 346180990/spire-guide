/**
 * 状态标签 —— 状态用「图标 + 文字 + 颜色」三重表达，不只靠颜色（spec §5）
 */

Component({
  properties: {
    text: { type: String, value: '' },
    tone: { type: String, value: 'muted' }, // ok | warn | danger | info | up | down | muted
    icon: { type: String, value: '' },
  },
  data: {
    glyph: '',
  },
  observers: {
    'tone, icon'() {
      const map = { ok: '●', warn: '▲', danger: '✕', info: '◆', up: '▲', down: '▼', muted: '○' };
      this.setData({ glyph: this.data.icon || map[this.data.tone] || '○' });
    },
  },
});
