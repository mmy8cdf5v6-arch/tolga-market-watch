export default async function handler(req,res){
  try{
    const raw=String(req.query.symbols||"").trim();
    if(!raw)return res.status(400).json({error:"Sembol belirtilmedi"});
    const symbols=raw.split(",").map(s=>s.trim().toUpperCase()).filter(Boolean).slice(0,50);
    const out={};
    await Promise.all(symbols.map(async symbol=>{
      const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
      const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0"}});
      if(!r.ok)return;
      const j=await r.json();
      const result=j?.chart?.result?.[0];
      const meta=result?.meta;
      const closes=result?.indicators?.quote?.[0]?.close?.filter(v=>Number.isFinite(v))||[];
      const price=Number(meta?.regularMarketPrice ?? closes.at(-1));
      const prev=Number(meta?.chartPreviousClose ?? closes.at(-2));
      if(Number.isFinite(price)){
        out[symbol]={price,previousClose:prev,changePercent:Number.isFinite(prev)&&prev!==0?((price-prev)/prev)*100:null};
      }
    }));
    res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({quotes:out});
  }catch(e){res.status(500).json({error:"Fiyat verisi alınamadı"});}
}