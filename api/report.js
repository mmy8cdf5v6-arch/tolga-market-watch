const CACHE_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_GENERATIONS = 6;

let cachedPayload = null;
let cacheExpiresAt = 0;
const rateBuckets = new Map();

const reportSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "generatedAt", "marketTone", "tags", "sections", "sources", "disclaimer"],
  properties: {
    title: { type: "string" },
    generatedAt: { type: "string" },
    marketTone: {
      type: "string",
      enum: ["risk-on", "risk-off", "mixed", "defensive", "unclear"]
    },
    tags: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "tone"],
        properties: {
          label: { type: "string" },
          tone: { type: "string", enum: ["risk", "opportunity", "neutral"] }
        }
      }
    },
    sections: {
      type: "array",
      minItems: 8,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "paragraphs"],
        properties: {
          heading: { type: "string" },
          paragraphs: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string" }
          }
        }
      }
    },
    sources: {
      type: "array",
      minItems: 5,
      maxItems: 18,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "url", "publisher", "publishedAt", "accessedAt"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          url: { type: "string" },
          publisher: { type: "string" },
          publishedAt: { type: "string" },
          accessedAt: { type: "string" }
        }
      }
    },
    disclaimer: { type: "string" }
  }
};

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function canGenerate(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { resetAt: now + RATE_LIMIT_WINDOW_MS, hits: 0 };
  if (bucket.resetAt <= now) {
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
    bucket.hits = 0;
  }
  bucket.hits += 1;
  rateBuckets.set(ip, bucket);
  return bucket.hits <= RATE_LIMIT_MAX_GENERATIONS;
}

function setJsonHeaders(res, statusCode) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
}

function sendJson(res, statusCode, payload) {
  setJsonHeaders(res, statusCode);
  res.end(JSON.stringify(payload));
}

function todayForIstanbul() {
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul"
  }).format(new Date());
}

function stripCodeFence(text) {
  const trimmed = String(text || "").trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function extractOutputText(responseJson) {
  if (typeof responseJson.output_text === "string") {
    return responseJson.output_text;
  }

  const parts = [];
  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const block of content) {
      if (typeof block.text === "string") parts.push(block.text);
      if (typeof block.output_text === "string") parts.push(block.output_text);
    }
  }
  return parts.join("\n").trim();
}

function parseReport(rawText) {
  const parsed = JSON.parse(stripCodeFence(rawText));
  const headings = parsed.sections?.map((section) => section.heading) || [];
  const requiredHeadings = [
    "Bugünün özü",
    "Piyasa resmi",
    "Jeopolitik radar",
    "Teknoloji ve gelecek temaları",
    "Şirket ve sektör notları",
    "Bugün izlenecekler",
    "Portföy açısından anlamı",
    "Genel değerlendirme"
  ];

  for (const heading of requiredHeadings) {
    if (!headings.some((value) => String(value).toLocaleLowerCase("tr-TR") === heading.toLocaleLowerCase("tr-TR"))) {
      throw new Error(`Raporda beklenen bölüm eksik: ${heading}`);
    }
  }

  parsed.sources = Array.isArray(parsed.sources)
    ? parsed.sources.filter((source) => {
        try {
          const url = new URL(source.url);
          return url.protocol === "https:" || url.protocol === "http:";
        } catch (_error) {
          return false;
        }
      })
    : [];

  if (!parsed.sources.length) {
    throw new Error("Rapor kaynak listesi olmadan üretildi.");
  }

  return parsed;
}

async function generateReport() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("OPENAI_API_KEY Vercel Environment Variables içinde tanımlı değil.");
    error.statusCode = 500;
    throw error;
  }

  const model = process.env.OPENAI_MODEL || "gpt-5.5";
  const nowIso = new Date().toISOString();
  const today = todayForIstanbul();

  const prompt = [
    `Bugünün tarihi ve saat bilgisi: ${today} (Europe/Istanbul).`,
    "Türkçe bir Dünya Raporu üret. Rapor yatırım tavsiyesi değildir; kesin al-sat talimatı verme.",
    "Her önemli iddiayı güncel web kaynaklarıyla doğrula ve cümle içinde [S1], [S2] gibi kaynak kimliği kullan.",
    "Eski, önbelleğe alınmış veya doğrulanmamış bilgiyi güncel gerçek gibi yazma. Çelişen kaynak varsa çelişkiyi açıkça belirt.",
    "Kaynak önceliği: resmi kurumlar, merkez bankaları, şirket yatırımcı ilişkileri, borsa/veri sağlayıcıları ve güvenilir haber kurumları.",
    "Piyasa verilerini mümkün olan en güncel web kaynaklarından kontrol et: ABD/Avrupa/Asya endeksleri, vadeli işlemler, tahvil faizleri, dolar endeksi, altın, petrol, doğal gaz, Bitcoin ve kripto genel havası.",
    "Jeopolitik, teknoloji temaları, şirket bilançoları, regülasyonlar ve yatırımcı açısından sonuç bölümlerinde neden-sonuç ilişkisi kur.",
    "Yaklaşık 800-1200 kelime hedefle. Haber listesi gibi değil, süzülmüş sabah istihbarat notu gibi yaz.",
    "Bölüm başlıkları tam olarak şu sırada olsun: Bugünün özü, Piyasa resmi, Jeopolitik radar, Teknoloji ve gelecek temaları, Şirket ve sektör notları, Bugün izlenecekler, Portföy açısından anlamı, Genel değerlendirme.",
    "Bugün izlenecekler bölümünde saatleri mümkünse Türkiye saatiyle yaz. Emin değilsen 'saat doğrulanamadı' de.",
    "JSON şemasına birebir uy. sources dizisinde yalnızca raporda gerçekten kullandığın tıklanabilir kaynakları ver.",
    `generatedAt alanını bu ISO zamanıyla doldur: ${nowIso}.`
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      tools: [{ type: "web_search", external_web_access: true }],
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
      max_output_tokens: 5500,
      input: [
        {
          role: "system",
          content: "Sen disiplinli, kaynaklı ve temkinli bir Türkçe piyasa istihbarat analistisin. Abartılı dil, söylenti ve kesin portföy talimatlarından kaçınırsın."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "world_report",
          strict: true,
          schema: reportSchema
        }
      }
    })
  });

  const responseJson = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = responseJson.error?.message || "OpenAI rapor servisi geçici olarak yanıt vermedi.";
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  const rawText = extractOutputText(responseJson);
  if (!rawText) {
    throw new Error("Rapor servisi boş yanıt döndürdü.");
  }

  return parseReport(rawText);
}

module.exports = async function reportHandler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (!["GET", "POST"].includes(req.method)) {
    return sendJson(res, 405, {
      ok: false,
      error: "Bu işlem için GET veya POST kullanılmalı."
    });
  }

  const now = Date.now();
  const force = req.query?.force === "1";
  if (!force && cachedPayload && cacheExpiresAt > now) {
    return sendJson(res, 200, {
      ok: true,
      cached: true,
      cacheUntil: new Date(cacheExpiresAt).toISOString(),
      report: cachedPayload
    });
  }

  const ip = getClientIp(req);
  if (!canGenerate(ip)) {
    return sendJson(res, 429, {
      ok: false,
      error: "Rapor kısa süre içinde çok fazla yenilendi. Lütfen birkaç dakika sonra tekrar deneyin."
    });
  }

  try {
    const report = await generateReport();
    cachedPayload = report;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return sendJson(res, 200, {
      ok: true,
      cached: false,
      cacheUntil: new Date(cacheExpiresAt).toISOString(),
      report
    });
  } catch (error) {
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
    return sendJson(res, status, {
      ok: false,
      error: "Dünya Raporu şu anda üretilemedi.",
      detail: error.message || "Bilinmeyen hata"
    });
  }
};
