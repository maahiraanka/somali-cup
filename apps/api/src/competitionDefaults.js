export async function resetPublicCompetitionContent(conn){
  await conn.query('DELETE FROM competition_stage_events');
  await conn.query('DELETE FROM competition_stage_choices');
  await conn.query('DELETE FROM competition_stages');
  await conn.query('DELETE FROM competition_referrals');
  await conn.query('DELETE FROM competition_device_claims');
  await conn.query('DELETE FROM competition_supporters');
  await conn.query('DELETE FROM competition_nominations');
  await conn.query('DELETE FROM competition_choices');
  await conn.query('DELETE FROM competitions');

  const [[season]]=await conn.query(
    "SELECT id,name,status,starts_at,ends_at FROM seasons ORDER BY id DESC LIMIT 1"
  );
  if(!season)throw new Error('default_season_missing');

  const [cup]=await conn.query(`
    INSERT INTO competitions(
      slug,name,short_name,competition_type,choice_type,language_preset,status,
      allow_nominations,starts_at,ends_at,legacy_season_id
    ) VALUES ('somali-cup',?,'Somali Cup','STAGED','CITY','CUP',?,0,?,?,?)
  `,[
    season.name,
    season.status==='COMPLETE'?'COMPLETE':'LIVE',
    season.starts_at,season.ends_at,season.id
  ]);
  const cupId=Number(cup.insertId);

  const [seasonCities]=await conn.query(`
    SELECT c.id,c.name,c.country,c.code,c.tier,sc.status,sc.qualification_target,sc.sort_order
    FROM season_cities sc
    JOIN cities c ON c.id=sc.city_id
    WHERE sc.season_id=? AND c.is_active=1
    ORDER BY sc.sort_order,c.name
  `,[season.id]);

  for(const row of seasonCities){
    await conn.query(`
      INSERT INTO competition_choices(
        competition_id,name,short_name,code,choice_type,legacy_city_id,status,target,sort_order,metadata_json
      ) VALUES (?,?,?,?,'CITY',?,?,?,?,?)
    `,[
      cupId,row.name,row.name,row.code,row.id,
      row.status==='CHAMPION'?'WINNER':row.status==='ELIMINATED'?'ELIMINATED':'ACTIVE',
      Number(row.qualification_target||0)||null,
      Number(row.sort_order||100),
      JSON.stringify({country:row.country,tier:row.tier})
    ]);
  }

  const [best]=await conn.query(`
    INSERT INTO competitions(
      slug,name,short_name,competition_type,choice_type,language_preset,status,allow_nominations
    ) VALUES ('best-city-somalia','Best City in Somalia','Best City','STAGED','CITY','CITY','LIVE',1)
  `);
  const bestId=Number(best.insertId);

  const [cities]=await conn.query(
    "SELECT id,name,country,code,tier FROM cities WHERE is_active=1 ORDER BY name"
  );
  const bestChoiceIds=[];
  for(let i=0;i<cities.length;i++){
    const city=cities[i];
    const [r]=await conn.query(`
      INSERT INTO competition_choices(
        competition_id,name,short_name,code,choice_type,legacy_city_id,status,target,next_supporter_no,sort_order,metadata_json
      ) VALUES (?,?,?,?,'CITY',?,'ACTIVE',1000,1,?,?)
    `,[
      bestId,city.name,city.name,city.code,city.id,i+1,
      JSON.stringify({country:city.country,tier:city.tier})
    ]);
    bestChoiceIds.push(Number(r.insertId));
  }

  const stageDefs=[
    ['QUALIFICATION','Round 1','QUALIFICATION',1,'OPEN','TARGET',1000,null,null],
    ['GROUP','Group Round','GROUP',2,'DRAFT','TARGET_OR_TOP_N',2500,2,4],
    ['SEMI_FINAL','Semi Final','SEMI_FINAL',3,'DRAFT','TOP_N',null,2,null],
    ['FINAL','Final','FINAL',4,'DRAFT','HIGHEST_AT_CLOSE',null,1,null]
  ];
  let firstStageId=null;
  for(const s of stageDefs){
    const [r]=await conn.query(`
      INSERT INTO competition_stages(
        competition_id,code,name,stage_type,sequence_no,status,rule_type,target,advance_count,group_size,starts_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `,[bestId,...s,s[4]==='OPEN'?new Date():null]);
    if(s[0]==='QUALIFICATION')firstStageId=Number(r.insertId);
  }

  for(let i=0;i<bestChoiceIds.length;i++){
    await conn.query(`
      INSERT INTO competition_stage_choices(stage_id,choice_id,seed_no,entry_supporter_count)
      VALUES (?,?,?,0)
    `,[firstStageId,bestChoiceIds[i],i+1]);
  }
  await conn.query(`
    INSERT INTO competition_stage_events(competition_id,stage_id,event_type,metadata_json)
    VALUES (?,?,'STAGE_OPENED',?)
  `,[bestId,firstStageId,JSON.stringify({choices:bestChoiceIds.length,resetToDefaults:true})]);

  return {
    competitions:2,
    somaliCupChoices:seasonCities.length,
    bestCityChoices:bestChoiceIds.length,
    bestCityStages:4
  };
}
