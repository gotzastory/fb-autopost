# Auto Post FB

Chrome extension สำหรับโพสต์ลงกลุ่ม Facebook หลายกลุ่มจากเบราว์เซอร์ของคุณเอง
สร้างใหม่จาก "FB Group Bulk Poster" 5.91 โดยตัดโค้ดขโมยข้อมูลออก ใช้ WXT + React + TypeScript

## ติดตั้ง

ก่อนติดตั้ง ให้ลบ extension ตัวเก่าออกจาก Chrome ทุก profile

```
npm install
npm run verify
```

จากนั้นเปิด `chrome://extensions` เปิด Developer mode กด **Load unpacked** แล้วเลือกโฟลเดอร์ `.output/chrome-mv3`

| คำสั่ง | ใช้ทำอะไร |
| --- | --- |
| `npm run dev` | รันแบบพัฒนา พร้อม hot reload |
| `npm run build` | build ลง `.output/chrome-mv3` |
| `npm run verify` | typecheck, lint, test, build และตรวจไฟล์ที่ build แล้ว |

## โครงสร้าง

| โฟลเดอร์ | หน้าที่ | ภาษา |
| --- | --- | --- |
| `src/entrypoints/` | จุดเริ่มต้นของ background, content scripts, popup และ dashboard | TS/React |
| `src/dashboard/` | หน้า dashboard และ hooks | TS/React |
| `src/lib/` | ตรรกะที่ทดสอบได้: กลุ่ม, สื่อ, ความคืบหน้า, spintax | TS (spintax เป็น JS) |
| `src/engine/` | สแกนกลุ่ม/เพจ สลับตัวตน และคุมการโพสต์ | JS เดิมที่แยกเป็นโมดูล |
| `src/content/` | สคริปต์ที่ทำงานบนหน้า Facebook | JS เดิม |
| `scripts/audit-build.mjs` | ตรวจไฟล์ที่ build แล้วก่อนนำไปใช้ | Node |

`src/engine` และ `src/content` เก็บเป็น JS ตามเดิม เพราะอาศัยโครงสร้างหน้า Facebook ซึ่งทดสอบได้กับบัญชีจริงเท่านั้น
ฟังก์ชันที่ส่งเข้า `chrome.scripting` ต้องไม่อ้างตัวแปรภายนอก และ build จะไม่ minify เพื่อให้เปิดอ่านโค้ดที่ติดตั้งจริงได้

## สิ่งที่ตัดออกจากตัวเดิม

- บล็อก obfuscated `core.js`: ส่งคุกกี้ Facebook, IP และรหัสผ่านที่กรอกใน dialog ไปยัง Google Apps Script
- บล็อกตรวจประเทศที่สั่งถอน extension ตัวเอง
- สิทธิ์ `alarms`, `declarativeNetRequestWithHostAccess` และโดเมน ipapi / freeipapi
- ตัวบล็อก DevTools (`shortcut-guard.js`)
- โค้ดที่ไม่ได้ใช้แล้ว: ตั้งเวลาโพสต์ (ไม่มีหน้า UI), `content.js`, `handler-utils.js`, `sw-state.js`

## การตรวจความปลอดภัย

`npm run verify` จะล้มเหลวเมื่อไฟล์ที่ build แล้วมีสิ่งต่อไปนี้:

- สิทธิ์หรือโดเมนนอกรายการที่อนุญาต
- URL ของโดเมนอื่น หรือ URL ที่ถูกแยกต่อ string
- ชื่อตัวแปรแบบ obfuscator
- การอ่านคุกกี้อื่นนอกจาก `c_user` / `i_user`
- ช่องทางส่งข้อมูลอื่น เช่น WebSocket, XHR ที่สร้างเอง, `sendBeacon` หรือ `setUninstallURL`
- `document.cookie` นอกจุดเดียวที่เช็ก `i_user` หรือ content script ที่เรียก `fetch` เอง
- CSP ใน manifest หายไป หรือเปิดให้เชื่อมต่อโดเมนอื่น

การตรวจนี้อ่านจากข้อความในไฟล์ จึงไม่ใช่หลักประกันสมบูรณ์ ควรรีวิวการเปลี่ยนแปลงทุกครั้งก่อน build

นอกจากนี้ build จริงมี CSP ให้เบราว์เซอร์บล็อกการเชื่อมต่อออกนอก Facebook จาก service worker, dashboard และ popup ตอนรันจริง
CSP นี้ไม่ครอบคลุมสคริปต์ที่ทำงานในหน้า Facebook และการเปิดแท็บ สองส่วนนี้ตรวจได้จาก `npm run verify` และการรีวิวโค้ดเท่านั้น

## ความเป็นส่วนตัว

- ไม่มีเซิร์ฟเวอร์ของผู้พัฒนา ข้อมูลถูกส่งไปที่ Facebook เท่านั้นตามการใช้งานปกติ
- รายชื่อกลุ่ม เพจ ชื่อและรูปโปรไฟล์ เก็บไว้ในเบราว์เซอร์ของผู้ใช้ และถูกลบเมื่อถอน extension
- อ่านเฉพาะคุกกี้ `c_user` และ `i_user` ซึ่งเป็นเลข ID เพื่อรู้ว่าใช้บัญชีหรือเพจไหน ไม่อ่านคุกกี้ล็อกอิน `xs` และไม่แตะรหัสผ่าน

## ข้อควรรู้

- ยังไม่เคยทดสอบการโพสต์จริงกับบัญชี Facebook ควรลองกับกลุ่มทดสอบกลุ่มเดียวก่อน
- การโพสต์ซ้ำจำนวนมากขัดกับข้อกำหนดของ Facebook และอาจทำให้บัญชีถูกจำกัด
