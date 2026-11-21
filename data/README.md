# 词库数据说明

`vocab.json` 由 `scripts/build_vocab.py` 生成，游戏运行时通过 fetch 读取。

## 字段

| 字段 | 含义 |
| --- | --- |
| `w` | 词头 / 短语 |
| `zh` | 中文释义（取常用义项，最多 3 个） |
| `pos` | 词性缩写 |
| `def` | 简明英文释义 |
| `ex` | 英文典型例句 |
| `theme` | 12 星域之一：daily / food / travel / school / health / nature / feelings / tech / sport / city / culture / people |
| `ket` | 是否属于 KET 基础词（默认不进 PET 战役） |
| `audio` | 英式发音文件相对路径 |
| `slug` | 音频文件名 |
| `quiz` | 是否适合作为射击选项 |
| `dictation` | 是否适合听写（单词、无空格） |
| `sentence` | 是否适合组句（例句长度） |
| `cloze` | 是否适合例句填空 |
| `syn` | 精选同义替换（少量高频词，用于展示） |

## 统计

- 3,283 个词条
- 1,579 个 PET 新增核心
- 1,704 个 KET 基础词（默认隐藏，可在「基础复习」或词库筛选里打开）
- 3,131 条例句
- 3,283 条发音
- 12 个主题

## 注意

`sentence` / `cloze` 标记是按例句长度预筛的；运行时还会检查例句中是否真的能找到目标词，找不到会自动回退为意义射击。
