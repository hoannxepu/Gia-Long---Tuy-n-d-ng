// spintax.js - BỘ PHÂN TÍCH VÀ ĐẢO NỘI DUNG SPINTAX CHUẨN XÁC, AN TOÀN
// Hỗ trợ lồng nhau tối đa 5 tầng, chống vòng lặp vô hạn, kiểm tra lỗi cú pháp và empty pipes.

(function (root) {
  const MAX_SPINTAX_DEPTH = 5;

  /**
   * Kiểm tra cú pháp Spintax
   * @param {string} text
   * @returns {{ valid: boolean, error?: string, maxDepth: number }}
   */
  function validateSpintax(text) {
    if (typeof text !== 'string') {
      return { valid: false, error: 'Đầu vào phải là chuỗi ký tự', maxDepth: 0 };
    }

    let depth = 0;
    let maxDepth = 0;
    let lastChar = '';
    const stack = [];

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === '{') {
        depth++;
        if (depth > maxDepth) maxDepth = depth;
        if (depth > MAX_SPINTAX_DEPTH) {
          return {
            valid: false,
            error: `Spintax lồng quá sâu (${depth} tầng). Tối đa cho phép là ${MAX_SPINTAX_DEPTH} tầng!`,
            maxDepth,
          };
        }
        stack.push({ index: i, hasOption: false, optionLength: 0 });
      } else if (char === '}') {
        if (depth <= 0) {
          return {
            valid: false,
            error: `Dư thừa dấu đóng ngoặc '}' tại vị trí ${i}!`,
            maxDepth,
          };
        }
        const top = stack.pop();
        if (top.optionLength === 0 && top.hasOption) {
          return {
            valid: false,
            error: `Tùy chọn rỗng trước dấu '}' tại vị trí ${i}!`,
            maxDepth,
          };
        }
        depth--;
      } else if (char === '|') {
        if (depth === 0) {
          // Ký tự pipe ngoài ngoặc nhọn được coi là ký tự văn bản thông thường
        } else {
          const top = stack[stack.length - 1];
          if (lastChar === '{') {
            return {
              valid: false,
              error: `Tùy chọn rỗng ngay sau dấu '{' tại vị trí ${i}!`,
              maxDepth,
            };
          }
          if (lastChar === '|') {
            return {
              valid: false,
              error: `Có 2 dấu pipe liên tiếp '||' (tùy chọn rỗng) tại vị trí ${i}!`,
              maxDepth,
            };
          }
          top.hasOption = true;
          top.optionLength = 0;
        }
      } else {
        if (depth > 0) {
          const top = stack[stack.length - 1];
          top.optionLength++;
        }
      }

      lastChar = char;
    }

    if (depth > 0) {
      return {
        valid: false,
        error: `Thiếu dấu đóng ngoặc '}' (${depth} ngoặc chưa được đóng)!`,
        maxDepth,
      };
    }

    return { valid: true, maxDepth };
  }

  /**
   * Đảo Spintax đệ quy ngẫu nhiên (chống lặp vô hạn với bộ đếm maxSteps)
   * @param {string} text
   * @param {function} randomFn - Hàm sinh số ngẫu nhiên [0, 1)
   * @returns {string}
   */
  function sampleSpintax(text, randomFn = Math.random) {
    if (!text || typeof text !== 'string') return '';

    // Kiểm tra tính hợp lệ trước khi đảo
    const check = validateSpintax(text);
    if (!check.valid) {
      console.warn('[Spintax] Cú pháp không hợp lệ, giữ nguyên văn bản:', check.error);
      return text;
    }

    let current = text;
    let stepCount = 0;
    const MAX_STEPS = 50; // Giới hạn tối đa 50 bước thay thế

    // Tìm và thay thế các khối Spintax sâu nhất không chứa ngoặc nhọn khác: {A|B|C}
    const innerRegex = /\{([^{}]+)\}/g;

    while (innerRegex.test(current) && stepCount < MAX_STEPS) {
      stepCount++;
      current = current.replace(innerRegex, (match, content) => {
        const parts = content.split('|');
        if (parts.length === 0) return '';
        const idx = Math.floor(randomFn() * parts.length);
        return parts[idx];
      });
    }

    return current;
  }

  /**
   * Tạo văn bản xem trước Spintax
   */
  function resolveSpintax(text) {
    return sampleSpintax(text);
  }

  const Spintax = {
    MAX_SPINTAX_DEPTH,
    validateSpintax,
    sampleSpintax,
    resolveSpintax,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Spintax;
  }
  if (typeof self !== 'undefined') {
    self.Spintax = Spintax;
    self.validateSpintax = validateSpintax;
    self.sampleSpintax = sampleSpintax;
    self.resolveSpintax = resolveSpintax;
  }
  if (typeof window !== 'undefined') {
    window.Spintax = Spintax;
    window.validateSpintax = validateSpintax;
    window.sampleSpintax = sampleSpintax;
    window.resolveSpintax = resolveSpintax;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
