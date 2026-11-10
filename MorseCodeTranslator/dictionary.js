/* Offline translation fallback - shared by browser and Node (no dependencies) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dict = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Common Chinese phrases / words -> English. Used only when the network is unavailable.
  var PAIRS = [
    ['你好世界', 'Hello World'], ['你好', 'Hello'], ['您好', 'Hello'],
    ['世界', 'World'], ['今天', 'Today'], ['明天', 'Tomorrow'], ['昨天', 'Yesterday'],
    ['早上', 'Morning'], ['晚上', 'Evening'], ['中午', 'Noon'], ['现在', 'Now'],
    ['天气', 'Weather'], ['很好', 'Very Good'], ['好的', 'Okay'], ['好', 'Good'],
    ['谢谢', 'Thank You'], ['谢谢你', 'Thank You'], ['不客气', 'You Are Welcome'],
    ['对不起', 'Sorry'], ['抱歉', 'Sorry'], ['请', 'Please'], ['请问', 'Excuse Me'],
    ['再见', 'Goodbye'], ['欢迎', 'Welcome'], ['是', 'Yes'], ['不是', 'No'],
    ['不', 'Not'], ['有', 'Have'], ['没有', 'No'], ['我', 'I'], ['你', 'You'],
    ['他', 'He'], ['她', 'She'], ['它', 'It'], ['我们', 'We'], ['你们', 'You'],
    ['他们', 'They'], ['这', 'This'], ['那', 'That'], ['这里', 'Here'], ['那里', 'There'],
    ['什么', 'What'], ['为什么', 'Why'], ['怎么', 'How'], ['哪里', 'Where'],
    ['谁', 'Who'], ['多少', 'How Many'], ['时候', 'Time'], ['时间', 'Time'],
    ['爱', 'Love'], ['喜欢', 'Like'], ['朋友', 'Friend'], ['家人', 'Family'],
    ['家', 'Home'], ['学校', 'School'], ['工作', 'Work'], ['学习', 'Study'],
    ['电脑', 'Computer'], ['手机', 'Phone'], ['软件', 'Software'], ['数据', 'Data'],
    ['密码', 'Password'], ['代码', 'Code'], ['摩斯电码', 'Morse Code'], ['电码', 'Code'],
    ['翻译', 'Translate'], ['语言', 'Language'], ['中文', 'Chinese'], ['语文', 'Chinese'],
    ['英语', 'English'], ['英文', 'English'], ['消息', 'Message'], ['信息', 'Information'],
    ['信号', 'Signal'], ['求救', 'Help'], ['救命', 'Help'], ['紧急', 'Emergency'],
    ['危险', 'Danger'], ['安全', 'Safe'], ['和平', 'Peace'], ['自由', 'Freedom'],
    ['快乐', 'Happy'], ['生日快乐', 'Happy Birthday'], ['新年快乐', 'Happy New Year'],
    ['成功', 'Success'], ['失败', 'Failure'], ['开始', 'Start'], ['结束', 'End'],
    ['打开', 'Open'], ['关闭', 'Close'], ['运行', 'Run'], ['停止', 'Stop'],
    ['发送', 'Send'], ['接收', 'Receive'], ['读取', 'Read'], ['写入', 'Write'],
    ['文件', 'File'], ['壁纸', 'Wallpaper'], ['桌面', 'Desktop'], ['音乐', 'Music'],
    ['水', 'Water'], ['火', 'Fire'], ['太阳', 'Sun'], ['月亮', 'Moon'],
    ['星星', 'Star'], ['天空', 'Sky'], ['大海', 'Sea'], ['山', 'Mountain'],
    ['风', 'Wind'], ['雨', 'Rain'], ['雪', 'Snow'], ['花', 'Flower'],
    ['猫', 'Cat'], ['狗', 'Dog'], ['人', 'Person'], ['人们', 'People'],
    ['中国', 'China'], ['北京', 'Beijing'], ['上海', 'Shanghai'], ['城市', 'City'],
    ['大', 'Big'], ['小', 'Small'], ['多', 'Many'], ['少', 'Few'],
    ['快', 'Fast'], ['慢', 'Slow'], ['新', 'New'], ['旧', 'Old'],
    ['红', 'Red'], ['蓝', 'Blue'], ['绿', 'Green'], ['黑', 'Black'], ['白', 'White'],
    ['一', 'One'], ['二', 'Two'], ['三', 'Three'], ['四', 'Four'], ['五', 'Five'],
    ['六', 'Six'], ['七', 'Seven'], ['八', 'Eight'], ['九', 'Nine'], ['十', 'Ten'],
    ['零', 'Zero'], ['第一', 'First'], ['最后', 'Last'], ['可以', 'Can'],
    ['需要', 'Need'], ['想要', 'Want'], ['知道', 'Know'], ['觉得', 'Think'],
    ['因为', 'Because'], ['所以', 'So'], ['但是', 'But'], ['和', 'And'],
    ['或者', 'Or'], ['如果', 'If'], ['非常', 'Very'], ['很', 'Very'],
    ['真的', 'Really'], ['一起', 'Together'], ['永远', 'Forever'],
    ['测试', 'Test'], ['示例', 'Example'], ['问题', 'Question'], ['答案', 'Answer'],
    ['上午', 'Morning'], ['下午', 'Afternoon'], ['晚安', 'Good Night'],
    ['早上好', 'Good Morning'], ['加油', 'Keep Going'], ['没关系', 'Never Mind'],
    ['我很好', 'I Am Fine'], ['我爱你', 'I Love You'], ['我爱你', 'I Love You'],
    ['正在', 'Currently'], ['已经', 'Already'], ['还', 'Still'], ['再', 'Again'],
    ['会', 'Will'], ['能', 'Can'], ['应该', 'Should'], ['必须', 'Must']
  ];

  var ZH2EN = {};
  var EN2ZH = {};
  PAIRS.forEach(function (p) {
    if (!ZH2EN[p[0]]) ZH2EN[p[0]] = p[1];
    var key = p[1].toLowerCase();
    if (!EN2ZH[key]) EN2ZH[key] = p[0];
  });
  var ZH_KEYS = Object.keys(ZH2EN).sort(function (a, b) { return b.length - a.length; });

  var isCJK = function (c) { return /[\u3400-\u9FFF]/.test(c); };

  function zh2en(text) {
    var src = String(text || '');
    var out = [];
    var i = 0;
    while (i < src.length) {
      var ch = src[i];
      if (!isCJK(ch)) {
        out.push({ t: ch, sep: '' });
        i++;
        continue;
      }
      var matched = null;
      for (var k = 0; k < ZH_KEYS.length; k++) {
        var key = ZH_KEYS[k];
        if (src.substr(i, key.length) === key) { matched = key; break; }
      }
      if (matched) {
        out.push({ t: ZH2EN[matched], sep: ' ' });
        i += matched.length;
      } else {
        out.push({ t: '?', sep: ' ' });
        i++;
      }
    }
    var result = '';
    out.forEach(function (o) {
      if (o.sep === ' ' && result && !/\s$/.test(result)) result += ' ';
      result += o.t;
    });
    return result.replace(/\s+([,.!?;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  }

  function en2zh(text) {
    var src = String(text || '');
    return src.replace(/[A-Za-z']+|\s+|[^A-Za-z\s']/g, function (tok) {
      if (/^\s+$/.test(tok)) return '';
      if (!/^[A-Za-z']+$/.test(tok)) return tok;
      var key = tok.toLowerCase();
      if (EN2ZH[key]) return EN2ZH[key];
      // try simple bigrams for phrases like "hello world"
      return tok;
    }).replace(/\s*([，。！？,.!?])\s*/g, '$1');
  }

  function translate(text, direction) {
    return direction === 'en2zh' ? en2zh(text) : zh2en(text);
  }

  return { PAIRS: PAIRS, ZH2EN: ZH2EN, EN2ZH: EN2ZH, translate: translate };
});
