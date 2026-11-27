# ⚡ Solver Core

> **Tiện ích mở rộng tự động hóa & hỗ trợ giải bài tập thông minh trên mọi website quiz bằng AI (Gemini / OpenAI / Anthropic).**

[![Version](https://img.shields.io/badge/version-3.4.0-blue.svg?style=flat-square)](https://github.com/)
[![Platform](https://img.shields.io/badge/platform-Universal%20%7C%20LMS%20DUT%20%7C%20LMS%20DES%20%7C%20GDQP%20%7C%20Azota-orange.svg?style=flat-square)](https://github.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](https://github.com/)

**Solver Core** là tiện ích mở rộng (Browser Extension) thế hệ mới giúp tự động phân tích, xử lý và chọn đáp án trắc nghiệm trên **mọi website** có form quiz — bao gồm các nền tảng giáo dục phổ biến như **LMS DUT**, **LMS DES UDN**, **Hệ thống GDQP** và **Azota**, cùng hàng nghìn trang web khác (Google Forms, Microsoft Forms, Typeform, Kahoot clone, Moodle, Canvas, các trang ôn thi nội bộ…). Dự án tích hợp các API mô hình ngôn ngữ lớn tiên tiến (Google Gemini, OpenAI, Anthropic Claude) nhằm tối ưu hóa độ chính xác và hiệu suất làm bài.

---

## 🆕 Thông tin bản cập nhật v3.4.0

Phiên bản **v3.4.0** mở rộng phạm vi hoạt động từ các nền tảng cố định sang **chế độ Universal Auto Solver** — tự động nhận diện và giải mọi form trắc nghiệm trên mọi website — và bổ sung **bảng điều khiển bật/tắt extension theo từng website** ngay trên popup.

### 🌐 1. Universal Auto Solver (`content_universal.js`) — **Điểm nhấn mới**
* **Nhận diện DOM thông minh:** Quét tự động các nhóm `input[type="radio"]` và `input[type="checkbox"]` trên toàn bộ trang, nhóm chúng thành các câu hỏi độc lập bằng thuật toán leo DOM (leo lên đến 8 cấp), lọc container lồng nhau, loại bỏ trùng lặp.
* **Heuristic nhận diện câu hỏi:** Fallback qua nhiều selector phổ biến (`.question`, `.question-text`, `.qtext`, `legend`, `h1–h6`, `[class*="question"]`…) để bóc tách nội dung câu hỏi chính xác.
* **Nhận diện đa lựa chọn:** Tự động phát hiện câu hỏi multi-answer thông qua số lượng `checkbox` hoặc keyword ("chọn tất cả", "multiple", "select all"…).
* **Tương tác click 3 lớp:** `input.click()` → gán `checked = true` → dispatch `input/change` → click cả `label`/holder → đảm bảo tương thích với mọi framework (React, Vue, Angular, jQuery, vanilla).
* **Double-Check an toàn:** Trước khi bấm Next, kiểm tra toàn bộ nhóm radio trên trang đã có ít nhất 1 lựa chọn. Nếu còn câu chưa tick → **hủy lệnh Next**.
* **Chống xung đột:** Tự động loại trừ các domain đã có script chuyên dụng (LMS, Azota, GDQP) khỏi phạm vi chạy.

### 🎛️ 2. Bảng điều khiển bật/tắt theo từng Website (Domain Toggle) — **Tính năng mới**
* **Mặc định BẬT trên mọi website:** Extension hoạt động ngay khi cài đặt, không cần cấu hình thêm.
* **Tắt nhanh trên popup:** Mở popup khi đang ở trang không muốn extension chạy → gạt công tắc ở mục **"Trạng thái trên trang hiện tại"** sang OFF.
* **Danh sách trang đã tắt:** Hiển thị toàn bộ domain bị tắt, có nút **Xóa** để bật lại nhanh chóng.
* **Lưu trữ bền vững:** Danh sách được lưu vào `chrome.storage.sync` (đồng bộ qua các thiết bị nếu đăng nhập Chrome).
* **Áp dụng tức thời:** Content script kiểm tra danh sách trước khi khởi động — nếu domain nằm trong blacklist, script tự dừng, không gọi API, không tick đáp án, không gây lỗi.

### 🎖️ 3. Giữ nguyên hỗ trợ chuyên sâu
* **`content_lms.js`:** Xử lý đặc thù Moodle LMS DUT / LMS DES UDN với `.que`, `.qtext`, `.answer .r0/.r1`, `.state`.
* **`content_azota.js`:** Xử lý `.question-content`, `.answer-item`, `.answer-content label`.
* **`content_gdqp.js`:** Xử lý trang GDQP tĩnh (GitHub Pages `bun04.github.io/GDQP-DHDN`).

### 🎯 4. Cơ chế làm bài thông minh & Thuật toán Double-Check
* **Xử lý sự kiện chính xác:** Tool quét câu hỏi, gửi request tới AI. Khi nhận index đáp án, hệ thống kích hoạt đồng thời `input.click()` và `dispatchEvent` tương ứng để đảm bảo trình duyệt ghi nhận lựa chọn.
* **Tự động hoãn câu (Delay):** Sau khi chọn đáp án, tool tự động hoãn thời gian (tùy chỉnh qua thanh trượt) trước khi sang câu kế tiếp.
* **Vòng lặp Double-Check an toàn tuyệt đối:** Sau khi hoàn thành lượt quét trên trang, tool kích hoạt cơ chế tái kiểm tra DOM toàn bộ câu hỏi. Nếu phát hiện bất kỳ câu nào chưa có trạng thái `input:checked`, hệ thống sẽ **ngay lập tức hủy lệnh Next trang**, ngăn chặn triệt để tình trạng bỏ sót câu hỏi.

### 🛡️ 5. Xử lý lỗi mạng & Hạn chế API
* Khi xảy ra sự cố kết nối hoặc AI trả về lỗi, cờ `allSuccess` / `allOk` tự động chuyển sang `false` ➔ **Hệ thống chủ động hủy lệnh Next** để người dùng xử lý kịp thời.
* Universal script dùng delay tối đa **6 giây** cho mỗi câu (thay vì 15s mặc định ở các script chuyên dụng) để tránh treo trang lâu trên web lạ.

### 🔄 6. Chế độ xem lại bài (Review Mode)
* **Tự động sửa lỗi:** Tool tự động dò tìm các câu trả lời sai và click lại đáp án đúng với tốc độ 1.5 giây/câu.
* **Giao diện sạch:** Hoạt động hoàn toàn ngầm, **không hiển thị thông báo đè lên web**.
* **Khóa điều hướng:** **Tuyệt đối không tự động bấm Next** ở chế độ xem lại bài để tránh làm rối luồng theo dõi của người dùng.

---

## 💡 Tính năng nổi bật

* 🤖 **Tích hợp AI đa dạng:** Hỗ trợ kết nối mượt mà API từ Google Gemini, OpenAI và Anthropic Claude.
* ⚡ **Universal Auto Solver:** Tự động pick đáp án trên **mọi website** có form trắc nghiệm, không giới hạn nền tảng.
* 🎛️ **Bật/tắt theo từng website:** Tắt nhanh extension trên các trang không cần thiết ngay trên popup; mặc định bật trên mọi web.
* 🎯 **Hỗ trợ chuyên sâu:** LMS DUT, LMS DES UDN (`daotao.des.udn.vn`), GDQP, Azota với selector tối ưu.
* 🔒 **Double-Check Protection:** Cơ chế kiểm tra 2 lớp đảm bảo 100% câu hỏi trên trang đã được tô đáp án trước khi chuyển trang.
* ⚙️ **Tùy chỉnh thời gian (Delay):** Chủ động điều chỉnh khoảng hoãn thời gian giữa các câu hỏi để phù hợp với quy định từng nền tảng.
* 📊 **Kiểm tra kết nối trực tiếp:** Cho phép Test API Key ngay trên giao diện tiện ích trước khi làm bài.
* 🛡️ **Stealth Protection:** Vô hiệu hóa phát hiện tab ẩn, blur, focus, contextmenu — chống anti-cheat cơ bản.

---

## 🚀 Hướng dẫn cài đặt nhanh (3 bước)

### 🔴 Bước 1: Tải tiện ích về máy
1. Truy cập mục **[Releases](../../releases)** ở cột bên phải giao diện GitHub.
2. Tải file **`solver-core-v3.4.0.zip`** bản mới nhất về máy tính.
3. Giải nén file `.zip` vừa tải ra một thư mục (ví dụ: `solver-core`).

---

### 🔴 Bước 2: Cài đặt vào trình duyệt (Chrome / Microsoft Edge / Brave / Cốc Cốc)
1. Mở trình duyệt và dán đường dẫn tương ứng vào thanh địa chỉ:
   * **Chrome:** `chrome://extensions/`
   * **Edge:** `edge://extensions/`
   * **Brave:** `brave://extensions/`
   * **Cốc Cốc:** `coccoc://extensions/`
2. Bật công tắc **Chế độ nhà phát triển (Developer Mode)** ở góc trên bên phải màn hình.
3. Nhấn nút **Tải tiện ích đã giải nén (Load unpacked)** ở góc trái.
4. Trỏ tới và chọn thư mục `solver-core` đã giải nén ở Bước 1.

---

### 🔴 Bước 3: Cấu hình API Key và sử dụng
1. Nhấp vào biểu tượng tiện ích **Solver Core** trên thanh công cụ trình duyệt để mở giao diện cài đặt.
2. Thực hiện thiết lập API Key và lưu cấu hình (xem chi tiết ở phần bên dưới) trước khi mở trang bài tập bất kỳ.

---

## ⚙️ Cấu hình & Thiết lập API Key

### 1. Cách lấy Gemini API Key (Miễn phí):
1. Truy cập **[Google AI Studio](https://aistudio.google.com/)** và đăng nhập tài khoản Google.
2. Vào mục **Dashboard** ➔ chọn **API keys** ➔ nhấn **Create API Key**.
   > ⚠️ **Lưu ý:** Giữ API Key bảo mật, tuyệt đối không chia sẻ cho người khác.
3. **Sao chép (Copy)** đoạn mã Key vừa tạo.

### 2. Dán Key vào tiện ích Solver Core:
1. Nhấp vào biểu tượng tiện ích **Solver Core** trên thanh công cụ trình duyệt.
2. Điền thông tin cấu hình:
   * **Provider (Nhà cung cấp):** Chọn `Google Gemini`
   * **API Key:** Dán đoạn Key vừa sao chép vào
   * **Model recommended:** `gemini-2.5-flash
