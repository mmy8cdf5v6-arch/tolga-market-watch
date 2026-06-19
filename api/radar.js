const universe=["NVDA","AMD","AVGO","MRVL","ARM","TSM","ASML","MU","SMCI","PLTR","SNOW","DDOG","NET","CRWD","SOUN","BBAI","VRT","ANET","DELL","ORCL","CEG","VST","GEV","ETN","OKLO"];
export default async function handler(req,res){
  try{
    const rows=[];
    await Promise.all(universe.map(async symbol=>{
      const url=`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1mo&interval=1d`;
      const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0"}});
      if(!r.ok)return;
      const j=await r.json();const result=j?.chart?.result?.[0];const meta=result?.meta;
      const closes=result?.indicators?.quote?.[0]?.close?.filter(v=>Number.isFinite(v))||[];
      if(closes.length<2)return;
      const price=Number(meta?.regularMarketPrice??closes.at(-1));
      const prev=Number(meta?.chartPreviousClose??closes.at(-2));
      const d1=((price-prev)/prev)*100;
      const base=closes[Math.max(0,closes.length-6)];
      const d5=((price-base)/base)*100;
      const score=Math.round(Math.max(0,d1*2)+Math.max(0,d5)+Math.min(15,Math.abs(d1)));
      if(score>=8)rows.push({symbol,changePercent:d1,score,reason:`Günlük ${d1.toFixed(1)}%, yaklaşık 5 günlük ${d5.toFixed(1)}% momentum.`});
    }));
    rows.sort((a,b)=>b.score-a.score);
    res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({items:rows.slice(0,8)});
  }catch(e){res.status(500).json({error:"Radar verisi alınamadı"});}
}