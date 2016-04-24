"use strict";

// This file was originally written by @drudru (https://github.com/drudru/ansi_up), MIT, 2011

const ANSI_COLORS = [
    [
        { color: "0, 0, 0",        "class": "ansi-black"   }
      , { color: "187, 0, 0",      "class": "ansi-red"     }
      , { color: "0, 187, 0",      "class": "ansi-green"   }
      , { color: "187, 187, 0",    "class": "ansi-yellow"  }
      , { color: "0, 0, 187",      "class": "ansi-blue"    }
      , { color: "187, 0, 187",    "class": "ansi-magenta" }
      , { color: "0, 187, 187",    "class": "ansi-cyan"    }
      , { color: "255,255,255",    "class": "ansi-white"   }
    ]
  , [
        { color: "85, 85, 85",     "class": "ansi-bright-black"   }
      , { color: "255, 85, 85",    "class": "ansi-bright-red"     }
      , { color: "0, 255, 0",      "class": "ansi-bright-green"   }
      , { color: "255, 255, 85",   "class": "ansi-bright-yellow"  }
      , { color: "85, 85, 255",    "class": "ansi-bright-blue"    }
      , { color: "255, 85, 255",   "class": "ansi-bright-magenta" }
      , { color: "85, 255, 255",   "class": "ansi-bright-cyan"    }
      , { color: "255, 255, 255",  "class": "ansi-bright-white"   }
    ]
];

module.exports = class Anser {
    static escapeForHtml (txt) {
      return new Anser().escapeForHtml(txt);
    }
    static linkify (txt) {
      return new Anser().linkify(txt);
    }
    static ansiToHtml (txt, options) {
      return new Anser().ansiToHtml(txt, options);
    }
    static ansiToJson (txt, options) {
      return new Anser().ansiToJson(txt, options);
    }
    static ansiToText (txt) {
      return new Anser().ansiToText(txt);
    }
    static ansiToHtmlObj () {
      return new Anser();
    }

    constructor () {
      this.fg = this.bg = this.fg_truecolor = this.bg_truecolor = null;
      this.bright = 0;
    }

    setupPalette () {
      this.PALETTE_COLORS = [];

      // Index 0..15 : System color
      for (let i = 0; i < 2; ++i) {
          for (let j = 0; j < 8; ++j) {
              this.PALETTE_COLORS.push(ANSI_COLORS[i][j].color);
          }
      }

      // Index 16..231 : RGB 6x6x6
      // https://gist.github.com/jasonm23/2868981#file-xterm-256color-yaml
      let levels = [0, 95, 135, 175, 215, 255];
      let format = (r, g, b) => levels[r] + ", " + levels[g] + ", " + levels[b];
      let r, g, b;
      for (let r = 0; r < 6; ++r) {
        for (let g = 0; g < 6; ++g) {
          for (let b = 0; b < 6; ++b) {
            this.PALETTE_COLORS.push(format.call(this, r, g, b));
          }
        }
      }

      // Index 232..255 : Grayscale
      let level = 8;
      for (let i = 0; i < 24; ++i, level += 10) {
        this.PALETTE_COLORS.push(format.call(this, level, level, level));
      }
    }

    escapeForHtml (txt) {
      return txt.replace(/[&<>]/gm, function(str) {
        if (str == "&") return "&amp;";
        if (str == "<") return "&lt;";
        if (str == ">") return "&gt;";
      });
    }

    linkify (txt) {
      return txt.replace(/(https?:\/\/[^\s]+)/gm, function(str) {
        return "<a href=\"" + str + "\">" + str + "</a>";
      });
    }

    ansiToHtml (txt, options) {
      return this.process(txt, options, true);
    }

    ansiToJson (txt, options) {
      options = options || {};
      options.json = true;
      return this.process(txt, options, true);
    }

    ansiToText (txt) {
      return this.process(txt, {}, false);
    }

    process (txt, options, markup) {
      let self = this;
      let raw_text_chunks = txt.split(/\033\[/);
      let first_chunk = raw_text_chunks.shift(); // the first chunk is not the result of the split

      let color_chunks = raw_text_chunks.map(function (chunk) {
        return self.processChunk(chunk, options, markup);
      });

      if (options && options.json) {
          let first = self.processChunkJson("");
          first.content = first_chunk;
          color_chunks.unshift(first);
          if (options.remove_empty) {
              color_chunks = color_chunks.filter(function (c) {
                  return !c.isEmpty();
              });
          }
          return color_chunks;
      } else {
          color_chunks.unshift(first_chunk);
      }

      return color_chunks.join("");
    }

    processChunkJson (text, options, markup) {

      // Are we using classes or styles?
      options = typeof options == "undefined" ? {} : options;
      let use_classes = options.use_classes = typeof options.use_classes != "undefined" && options.use_classes;
      let key = options.key = use_classes ? "class" : "color";

      let result = {
          content: text
        , fg: null
        , bg: null
        , fg_truecolor: null
        , bg_truecolor: null
        , was_processed: false
        , isEmpty: function () {
              return !this.content;
          }
      };

      // Each "chunk" is the text after the CSI (ESC + "[") and before the next CSI/EOF.
      //
      // This regex matches four groups within a chunk.
      //
      // The first and third groups match code type.
      // We supported only SGR command. It has empty first group and "m" in third.
      //
      // The second group matches all of the number+semicolon command sequences
      // before the "m" (or other trailing) character.
      // These are the graphics or SGR commands.
      //
      // The last group is the text (including newlines) that is colored by
      // the other group"s commands.
      let matches = text.match(/^([!\x3c-\x3f]*)([\d;]*)([\x20-\x2c]*[\x40-\x7e])([\s\S]*)/m);

      if (!matches) return result;

      let orig_txt = result.content = matches[4];
      let nums = matches[2].split(";");

      // We currently support only "SGR" (Select Graphic Rendition)
      // Simply ignore if not a SGR command.
      if (matches[1] !== "" || matches[3] !== "m") {
        return result;
      }

      if (!markup) {
        return result;
      }

      let self = this;

      while (nums.length > 0) {
        let num_str = nums.shift();
        let num = parseInt(num_str);

        if (isNaN(num) || num === 0) {
          self.fg = self.bg = null;
          self.bright = 0;
        } else if (num === 1) {
          self.bright = 1;
        } else if (num == 39) {
          self.fg = null;
        } else if (num == 49) {
          self.bg = null;
        } else if ((num >= 30) && (num < 38)) {
          self.fg = ANSI_COLORS[self.bright][(num % 10)][key];
        } else if ((num >= 90) && (num < 98)) {
          self.fg = ANSI_COLORS[1][(num % 10)][key];
        } else if ((num >= 40) && (num < 48)) {
          self.bg = ANSI_COLORS[0][(num % 10)][key];
        } else if ((num >= 100) && (num < 108)) {
          self.bg = ANSI_COLORS[1][(num % 10)][key];
        } else if (num === 38 || num === 48) { // extend color (38=fg, 48=bg)
            let is_foreground = (num === 38);
            if (nums.length >= 1) {
              let mode = nums.shift();
              if (mode === "5" && nums.length >= 1) { // palette color
                let palette_index = parseInt(nums.shift());
                if (palette_index >= 0 && palette_index <= 255) {
                  if (!use_classes) {
                    if (!this.PALETTE_COLORS) {
                      self.setupPalette.call(self);
                    }
                    if (is_foreground) {
                      self.fg = this.PALETTE_COLORS[palette_index];
                    } else {
                      self.bg = this.PALETTE_COLORS[palette_index];
                    }
                  } else {
                    let klass = (palette_index >= 16)
                          ? ("ansi-palette-" + palette_index)
                          : ANSI_COLORS[palette_index > 7 ? 1 : 0][palette_index % 8]["class"];
                    if (is_foreground) {
                      self.fg = klass;
                    } else {
                      self.bg = klass;
                    }
                  }
                }
              } else if(mode === "2" && nums.length >= 3) { // true color
                let r = parseInt(nums.shift());
                let g = parseInt(nums.shift());
                let b = parseInt(nums.shift());
                if ((r >= 0 && r <= 255) && (g >= 0 && g <= 255) && (b >= 0 && b <= 255)) {
                  let color = r + ", " + g + ", " + b;
                  if (!use_classes) {
                    if (is_foreground) {
                      self.fg = color;
                    } else {
                      self.bg = color;
                    }
                  } else {
                    if (is_foreground) {
                      self.fg = "ansi-truecolor";
                      self.fg_truecolor = color;
                    } else {
                      self.bg = "ansi-truecolor";
                      self.bg_truecolor = color;
                    }
                  }
                }
              }
            }
        }
      }

      if ((self.fg === null) && (self.bg === null)) {
        return result;
      } else {
        let styles = [];
        let classes = [];
        let data = {};

        result.fg = self.fg;
        result.bg = self.bg;
        result.fg_truecolor = self.fg_truecolor;
        result.bg_truecolor = self.bg_truecolor;
        result.was_processed = true;

        return result;
      }
    }

    processChunk (text, options, markup) {

      let self = this;
      options = options || {};
      let jsonChunk = this.processChunkJson(text, options, markup);
      if (options.json) { return jsonChunk; }
      if (jsonChunk.isEmpty()) { return ""; }
      if (!jsonChunk.was_processed) { return jsonChunk.content; }
      let key = options.key;
      let use_classes = options.use_classes;

      let styles = [];
      let classes = [];
      let data = {};
      let render_data = function (data) {
        let fragments = [];
        let key;
        for (key in data) {
          if (data.hasOwnProperty(key)) {
            fragments.push("data-" + key + "=\"" + this.escapeForHtml(data[key]) + "\"");
          }
        }
        return fragments.length > 0 ? " " + fragments.join(" ") : "";
      };

      if (jsonChunk.fg) {
        if (use_classes) {
          classes.push(jsonChunk.fg + "-fg");
          if (jsonChunk.fg_truecolor !== null) {
            data["ansi-truecolor-fg"] = jsonChunk.fg_truecolor;
            jsonChunk.fg_truecolor = null;
          }
        } else {
          styles.push("color:rgb(" + jsonChunk.fg + ")");
        }
      }

      if (jsonChunk.bg) {
        if (use_classes) {
          classes.push(jsonChunk.bg + "-bg");
          if (jsonChunk.bg_truecolor !== null) {
            data["ansi-truecolor-bg"] = jsonChunk.bg_truecolor;
            jsonChunk.bg_truecolor = null;
          }
        } else {
          styles.push("background-color:rgb(" + jsonChunk.bg + ")");
        }
      }

      if (use_classes) {
        return "<span class=\"" + classes.join(" ") + "\"" + render_data.call(self, data) + ">" + jsonChunk.content + "</span>";
      } else {
        return "<span style=\"" + styles.join(";") + "\"" + render_data.call(self, data) + ">" + jsonChunk.content + "</span>";
      }
    }
};