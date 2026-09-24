let state='STARTING';
let detail=null;

export const getStartupState=()=>({state,detail});
export const markStartupReady=()=>{state='READY';detail=null};
export const markStartupFailed=error=>{state='FAILED';detail=String(error?.message||error||'bootstrap failed')};
