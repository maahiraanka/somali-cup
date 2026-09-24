const packs={
  CUP:{
    person:'Supporter',people:'Supporters',
    score:'Goal',scores:'Goals',
    friend:'Friend',friends:'Friends',
    join:'Join',missingChoice:'Add my city',
    progress:'needed to qualify',winner:'Champion'
  },
  CITY:{
    person:'Supporter',people:'Supporters',
    score:'Supporter',scores:'Supporters',
    friend:'Friend',friends:'Friends',
    join:'Support this city',missingChoice:'Add my city',
    progress:'more supporters needed',winner:'Most supported city'
  },
  UNIVERSITY:{
    person:'Student',people:'Students',
    score:'Supporter',scores:'Supporters',
    friend:'Friend',friends:'Friends',
    join:'Support this university',missingChoice:'Add my university',
    progress:'more supporters needed',winner:'Top university'
  },
  CLUB:{
    person:'Fan',people:'Fans',
    score:'Supporter',scores:'Supporters',
    friend:'Friend',friends:'Friends',
    join:'Support this club',missingChoice:'Add my club',
    progress:'more supporters needed',winner:'Top club'
  },
  FAN:{
    person:'Fan',people:'Fans',
    score:'Supporter',scores:'Supporters',
    friend:'Friend',friends:'Friends',
    join:'Support',missingChoice:'Add a choice',
    progress:'more supporters needed',winner:'Fan favourite'
  },
  SIMPLE:{
    person:'Supporter',people:'Supporters',
    score:'Supporter',scores:'Supporters',
    friend:'Friend',friends:'Friends',
    join:'Join',missingChoice:'Add a choice',
    progress:'more needed',winner:'Winner'
  }
};

export function languageFor(preset='SIMPLE',overrides=null){
  let custom={};
  if(overrides&&typeof overrides==='object')custom=overrides;
  else if(typeof overrides==='string'){
    try{custom=JSON.parse(overrides)||{}}catch{}
  }
  return {...(packs[preset]||packs.SIMPLE),...custom};
}

export function supportedLanguagePresets(){
  return Object.keys(packs);
}