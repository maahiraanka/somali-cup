export default function handler(_req,res){
  res.status(200).json({
    ok:true,
    service:'somali-cup-vercel',
    version:'0.3.1-vercel-probe'
  });
}
