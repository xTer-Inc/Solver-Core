# ⚡ Solver Core

> **Universal AI auto-solver — Tự động giải trắc nghiệm trên mọi website bằng AI (Gemini / OpenAI / Anthropic).**

[![Version](https://img.shields.io/badge/version-3.4.1-blue.svg?style=flat-square)](../../releases)
[![Platform](https://img.shields.io/badge/platform-Universal%20%7C%20LMS%20DUT%20%7C%20LMS%20DES%20%7C%20GDQP%20%7C%20Azota%20%7C%20Vercel-orange.svg?style=flat-square)](#pham-vi-hoat-dong)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](#ban-quyen--dieu-khoan)

**Solver Core** là tiện ích mở rộng (Chrome / Edge / Brave / Cốc Cốc) tự động phân tích và chọn đáp án trắc nghiệm trên **mọi website**, bao gồm:

- **Nền tảng giáo dục phổ biến:** LMS DUT, LMS DES UDN (`daotao.des.udn.vn`), Azota, GDQP GitHub Pages.
- **Web tĩnh hiện đại:** React / Vue / Svelte SPA trên Vercel, Netlify, GitHub Pages — ví dụ `webtracnghiem-rho.vercel.app`.
- **Hàng nghìn trang quiz khác:** Google Forms, Microsoft Forms, Typeform, Moodle, Canvas, Kahoot clone và các trang ôn thi nội bộ.

Dự án tích hợp 3 nhà cung cấp LLM hàng đầu (**Google Gemini**, **OpenAI**, **Anthropic Claude**) với cơ chế **retry thông minh** và **double-check** chống bỏ sót câu.

---

## 📑 Mục lục

- [Cập nhật v3.4.1](#-cập-nhật-v341)
- [Tính năng nổi bật](#-tính-năng-nổi-bật)
- [Cài đặt (3 bước)](#-cài-đặt-3-bước)
- [Lấy API Key (Gemini — miễn phí)](#-lấy-api-key-gemini--miễn-phí)
- [Phạm vi hoạt động](#-phạm-vi-hoạt-động)
- [Khắc phục sự cố](#-khắc-phục-sự-cố)
- [Bảo mật & Quyền riêng tư](#-bảo-mật--quyền-riêng-tư)
- [Bản quyền & Điều khoản](#-bản-quyền--điều-khoan)

---

## 🆕 Cập nhật v3.4.1

Bản **v3.4.1** tập trung vào **độ ổn định và khả năng tương thích với web tĩnh hiện đại**, khắc phục các hạn chế của v3.4.0:

### 🌐 Universal Solver — Viết lại theo hướng production-grade
- **Hai engine song song:**
  - **Input-based:** Xử lý các câu hỏi dùng `<input type="radio|checkbox">` (LMS, Moodle, Google Forms…).
  - **Clickable-based:** Xử lý các câu hỏi dùng `<button>`, `<div>`, `<li>` làm phương án (React/Vue SPA kiểu Vercel) — **không cần thẻ `<input>`**.
- **Click stack 3 lớp:** `input.click()` → `MouseEvent` → `label/holder.click()`. Tương thích mọi framework (React, Vue, Angular, Svelte, jQuery, Vanilla JS).
- **Blacklist thông minh:** Tự động loại bỏ nút điều hướng và nút phản hồi (*"Tiếp"*, *"Next"*, *"Submit"*, *"Đúng"*, *"Sai"*, *"Giải thích"*, *"Xem lại"*, *"Lịch sử"*…) để tránh click nhầm.
- **`pageShowsFeedback()`:** Phát hiện trang web đã hiển thị đáp án đúng/sai → **ngừng re-solve** để tránh vòng lặp vô hạn.
- **Debounce 800ms:** Chống gọi AI trùng lặp khi DOM thay đổi liên tục do hiệu ứng chuyển câu hoặc highlight.
- **Ưu tiên câu trong viewport:** Khi trang render nhiều câu cùng lúc, ưu tiên giải câu đang hiển thị trên màn hình.
- **Page signature locking:** Khóa chữ ký trang, đảm bảo mỗi trạng thái câu hỏi chỉ giải 1 lần.

### 🎛️ Domain Toggle — Bật/tắt theo từng website
- **Mặc định BẬT** trên mọi trang web.
- **Tắt nhanh:** Mở popup extension → gạt công tắc **"Trạng thái trên trang hiện tại"** sang **OFF**.
- **Danh sách đen (Blacklist)** lưu vào `chrome.storage.sync` — có nút **Xóa** để kích hoạt lại bất cứ lúc nào.
- **Áp dụng tức thời:** Content script kiểm tra trạng thái domain trước khi khởi chạy.

### 🛡️ AI Bridge — Retry & chuẩn hóa dữ liệu
- **Retry 1 lần** với strict prompt nếu AI trả về sai định dạng JSON.
- **Chuẩn hóa output:** Hỗ trợ linh hoạt nhiều định dạng trả về (`{"answers":[...]}`, `{"index":n}`, `{"answer":"A"}`, `{"answer":0}`).
- **Lọc index hợp lệ:** Tự động loại bỏ các index âm hoặc vượt quá số lượng phương án thực tế.
- **Temperature = 0:** Giữ câu trả lời nhất quán và chính xác nhất.

### 🎯 Duy trì hỗ trợ chuyên sâu
- `content_lms.js` — Tối ưu riêng cho Moodle LMS DUT / LMS DES UDN.
- `content_azota.js` — Tối ưu riêng cho hệ thống thi Azota.
- `content_gdqp.js` — Tối ưu riêng cho trang ôn thi GDQP GitHub Pages.

### 🥷 Stealth Mode
- Vô hiệu hóa các sự kiện giám sát cơ bản: `visibilitychange`, `blur`, `focus`, `contextmenu`, `copy`, `paste`.
- Giả lập `navigator.webdriver = false`.
- Chặn sự kiện `exitFullscreen`.
- **Fail-silent:** Tự động bỏ qua lỗi nếu cấu trúc trang không tương thích, tuyệt đối không làm treo hoặc hỏng giao diện trang gốc.

---

## 💡 Tính năng nổi bật

| Tính năng | Mô tả chi tiết |
| :--- | :--- |
| 🤖 **AI đa dạng** | Hỗ trợ Google Gemini, OpenAI (GPT) và Anthropic Claude |
| ⚡ **Universal Engine** | Chạy trên mọi website — kể cả các web SPA hiện đại trên Vercel/Netlify |
| 🎛️ **Domain Toggle** | Bật/tắt nhanh tiện ích cho từng tên miền ngay trên popup |
| 🎯 **Script chuyên sâu** | Tối ưu hóa riêng cho LMS DUT, LMS DES, GDQP và Azota |
| 🔒 **Double-Check** | Kiểm tra kỹ trạng thái, không bấm Next khi còn câu chưa chọn đáp án |
| ⚙️ **Delay linh hoạt** | Tùy chỉnh thời gian chờ từ 1–120 giây để mô phỏng thao tác tự nhiên |
| 📊 **Test trực tiếp** | Kiểm tra độ sống của API Key và tốc độ phản hồi ngay trên popup |
| 🥷 **Stealth** | Vô hiệu hóa các cơ chế phát hiện chuyển tab / chống copy cơ bản |
| 🔁 **Retry AI** | Tự động gửi lại yêu cầu khi AI trả về sai cấu trúc |

---

## 🚀 Cài đặt (3 bước)

### Bước 1 — Tải về
1. Truy cập mục **[Releases](../../releases)** của repository này.
2. Tải tệp **`solver-core-v3.4.1.zip`**.
3. Giải nén tệp vừa tải ra một thư mục cố định (ví dụ: `D:\Extensions\solver-core`).

### Bước 2 — Cài vào trình duyệt
1. Mở trang quản lý tiện ích của trình duyệt:
   - **Chrome:** `chrome://extensions/`
   - **Edge:** `edge://extensions/`
   - **Brave:** `brave://extensions/`
   - **Cốc Cốc:** `coccoc://extensions/`
2. Bật công tắc **Developer mode (Chế độ dành cho nhà phát triển)** ở góc trên bên phải.
3. Nhấn **Load unpacked (Tải tiện ích đã giải nén)** → chọn thư mục `solver-core` vừa giải nén.

### Bước 3 — Cấu hình
1. Nhấn vào biểu tượng **Solver Core** trên thanh công cụ trình duyệt (có thể ghim icon để tiện thao tác).
2. Nhập **API Key**, chọn **Model**, sau đó nhấn **TEST KẾT NỐI** → **LƯU CẤU HÌNH**.
3. Mở trang làm bài trắc nghiệm bất kỳ và tải lại trang (`F5`), tiện ích sẽ tự động hoạt động.

---

## ⚙️ Lấy API Key (Gemini — miễn phí)

1. Truy cập [Google AI Studio](https://aistudio.google.com/) và đăng nhập bằng tài khoản Google.
2. Chọn **Dashboard → API keys → Create API Key**.
3. Sao chép (Copy) chuỗi API Key vừa tạo.
4. Dán vào giao diện cài đặt của **Solver Core**:
   - **Provider:** `Google Gemini`
   - **API Key:** Dán key của bạn
   - **Model:** `gemini-2.5-flash-lite` *(khuyến nghị — hạn mức RPM và Token cao nhất)*
   - **Delay:** Tùy chỉnh theo nhu cầu (mặc định `3s` / `15s`)
5. Nhấn **TEST KẾT NỐI → LƯU CẤU HÌNH**.

> 💡 **Gợi ý Model:** Bạn có thể dùng `gemini-2.5-flash` hoặc `gemini-2.0-flash`. Hạn chế dùng các dòng `pro` cho bài thi nhiều câu vì giới hạn số lượt gọi mỗi phút (RPM) thấp hơn.

---

## 🌐 Phạm vi hoạt động

| Nền tảng | Script xử lý | Trạng thái |
| :--- | :--- | :--- |
| **LMS DUT** (`lms.dut.udn.vn`) | `content_lms.js` | ✅ Chuyên sâu |
| **LMS DES UDN** (`daotao.des.udn.vn`) | `content_lms.js` | ✅ Chuyên sâu |
| **Azota** (`*.azota.vn`) | `content_azota.js` | ✅ Chuyên sâu |
| **GDQP GitHub Pages** (`bun04.github.io/GDQP-DHDN`) | `content_gdqp.js` | ✅ Chuyên sâu |
| **Web tĩnh Vercel / Netlify** (`webtracnghiem-rho.vercel.app`) | `content_universal.js` | ✅ **Universal** |
| **Mọi website quiz khác** (Google Forms, Moodle, Canvas…) | `content_universal.js` | ✅ Universal |

> **Cơ chế phân luồng:** `content_universal.js` chạy ở giai đoạn `document_idle` (sau khi trang tải xong) và tự động loại trừ các tên miền đã có script chuyên dụng để tránh xung đột hoặc chọn đáp án 2 lần.

---

## 🐞 Khắc phục sự cố

### 1. Tool không chạy trên web tĩnh (Vercel / Netlify)
- Kiểm tra xem trang web hiện tại có đang bị tắt trong **Domain Toggle** hay không.
- Mở **DevTools (`F12`) → tab Console**, dán lệnh sau để kiểm tra xem trang có nhận diện được các phần tử lựa chọn hay không:
  ```js
  document.querySelectorAll('button, [class*="option"], [class*="answer"], [class*="choice"]').length
  ```
- Nếu kết quả trả về `0`, trang web có thể đang nhúng câu hỏi bên trong `<iframe>` hoặc sử dụng Shadow DOM khép kín.

### 2. Tool báo `"Skip Next: unanswered"`
- Đây là cơ chế an toàn (**Double-Check**) ngăn tiện ích chuyển sang trang tiếp theo khi phát hiện vẫn còn câu hỏi chưa được chọn đáp án (do mạng chậm hoặc AI đang xử lý).
- **Cách xử lý:** Chờ thêm vài giây để AI hoàn tất câu còn lại hoặc tăng thời gian **Delay** lên mức phù hợp (ví dụ `5s–10s`).

### 3. Tool đã giải nhưng không click được đáp án
- Một số trang web render nội dung động chậm hơn tốc độ quét ban đầu. Hãy nhấn **`F5`** để tải lại trang và đợi 2–3 giây.
- Kiểm tra tab **Console (`F12`)** xem có thông báo lỗi từ `[Solver Core]` hay không.

### 4. Lỗi Rate Limit (`429 Too Many Requests`)
- Nguyên nhân: Gửi quá nhiều yêu cầu trong 1 phút vượt quá hạn mức miễn phí của API Key.
- **Cách xử lý:**
  1. Tăng **Delay** giữa các câu lên `4s – 6s`.
  2. Chuyển sang model có hạn mức cao hơn như `gemini-2.5-flash-lite`.
  3. Tạo thêm một API Key mới trên Google AI Studio nếu key cũ đã chạm giới hạn ngày.

### 5. Lưu ý khi nâng cấp từ bản 3.4.0 → 3.4.1
- Sau khi ghi đè thư mục mã nguồn mới, vào `chrome://extensions/` và nhấn biểu tượng **Reload (Tải lại)** trên thẻ tiện ích **Solver Core**.
- Mở lại popup tiện ích và nhấn **LƯU CẤU HÌNH** 1 lần để khởi tạo dữ liệu mặc định cho tính năng **Domain Toggle**.

---

## 🔐 Bảo mật & Quyền riêng tư

- **Lưu trữ cục bộ:** Toàn bộ API Key và cấu hình cá nhân được lưu trực tiếp trên trình duyệt của bạn thông qua `chrome.storage.local` / `chrome.storage.sync`.
- **Không máy chủ trung gian:** Tiện ích gửi trực tiếp nội dung câu hỏi từ trình duyệt đến API chính thức của Google / OpenAI / Anthropic — không đi qua bất kỳ server thứ ba nào.
- **Mã nguồn mở minh bạch:** Bạn có thể tự kiểm tra toàn bộ mã nguồn trong thư mục cài đặt trước khi sử dụng.

---

## 📜 Bản quyền & Điều khoản

- Phát hành theo giấy phép **[MIT License](LICENSE)**.
- **Miễn trừ trách nhiệm:** Dự án được xây dựng nhằm mục đích nghiên cứu kỹ thuật tự động hóa trình duyệt, kiểm thử giao diện và hỗ trợ ôn tập cá nhân. Người dùng tự chịu trách nhiệm tuân thủ quy chế của cơ sở đào tạo và điều khoản sử dụng của các nền tảng liên quan.

---

Chúc các bạn học tập hiệu quả và đạt kết quả cao! 🚀
