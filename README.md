# PSA 與攝護腺癌決策台

單一檔案的靜態網頁（`index.html`），從 PSA 篩檢一路引導到攝護腺癌的風險分層與治療選項。

網址：<https://yht5582-source.github.io/Prostate-Cancer/>

## 設計原則：從年齡與 PSA 開始

- 初次接觸只需要年齡與 PSA。系統依「篩檢資格 → PSA 判讀 → MRI 與切片 → 病理與分期 → 風險分層 → 治療」的順序，在「下一步」卡片逐項提示該補的資料並說明理由，可在卡片內直接填寫。
- MRI、切片或分期影像已安排但還沒有結果時，可標記「待回報」，系統先用現有資料往下判斷。
- 每補一項資料，判讀、切片決策、風險分組、流程圖高亮都會同步更新，並留下時間紀錄；可一鍵複製摘要貼到病歷。

## 分頁

1. 引導評估：篩檢資格與追蹤間隔（AUA／EAU 風險適應）、PSA 判讀（5-ARI 校正、干擾因素、free PSA、PSA density）、MRI → 切片決策、確診後的 NCCN／EAU 分組、CAPRA、分期影像、生殖細胞基因檢測、治療選項
2. 風險分層對照：NCCN v5.2026、EAU 2026、ISUP grade group、UCSF-CAPRA（目前病人所在列會高亮）；低風險另標示「低腫瘤量」（舊版 NCCN 極低條件）
3. 治療與監測：各風險組治療選項、主動監測排程、CHAARTED 轉移負擔
4. PSA 追蹤與復發：PSA 倍增時間（對數迴歸）、術後／放療後生化復發定義、EAU 復發風險、EMBARK、nmCRPC
5. 健保給付：依藥品給付規定第九節（115.9.22）、第五節（115.08.21）做給付資格檢核（mCSPC、nmCRPC、mCRPC），列出共通規定（終生僅一種新型荷爾蒙藥品、停藥條件）、各藥摘要，以及指引建議但健保未給付的項目；PSA 追蹤分頁另檢核健保 nmCRPC 的 PSADT 計算條件
6. 流程總覽
7. 示例病例（虛構教學資料）
8. 參考文獻

## 開發

決策邏輯集中在 `index.html` 的 `/*ENGINE-START*/ … /*ENGINE-END*/` 區塊，可在 Node 單獨測試：

```bash
node tests.cjs
```

## 主要參考

- AUA/SUO Early Detection of Prostate Cancer Guideline, 2023（2026 年 2 月修訂）
- EAU-EANM-ESTRO-ESUR-ISUP-SIOG Guidelines on Prostate Cancer, 2026
- NCCN Guidelines: Prostate Cancer v5.2026（取消極低風險；極高風險＝≥2 項 cT3–4、GG4–5、PSA ≥40）
- AUA/ASTRO Clinically Localized Prostate Cancer Guideline, 2022
- PI-RADS v2.1；ISUP 2014 Gleason grading；UCSF-CAPRA
- STAMPEDE、CHAARTED、EMBARK 試驗；Phoenix 定義
- 衛生福利部中央健康保險署：全民健康保險藥品給付規定 第九節 抗癌瘤藥物（115.9.22 更新）、第五節 激素及影響內分泌機轉藥物（115.08.21 更新）

## 醫療安全聲明

本工具供醫療專業人員教育與流程輔助使用，不取代臨床判斷、多專科團隊討論與院內規範。資料只存在使用者瀏覽器的 localStorage，不會上傳；請勿輸入可識別病人身分的資訊。
