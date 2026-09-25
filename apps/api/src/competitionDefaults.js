export async function clearPublicCompetitionContent(conn){
  await conn.query('DELETE FROM competition_stage_events');
  await conn.query('DELETE FROM competition_stage_choices');
  await conn.query('DELETE FROM competition_stages');
  await conn.query('DELETE FROM competition_referrals');
  await conn.query('DELETE FROM competition_device_claims');
  await conn.query('DELETE FROM competition_supporters');
  await conn.query('DELETE FROM competition_nominations');
  await conn.query('DELETE FROM competition_choices');
  await conn.query('DELETE FROM competitions');

  await conn.query('DELETE FROM competition_awards');
  await conn.query('DELETE FROM funnel_events');
  await conn.query('DELETE FROM awards');
  await conn.query('DELETE FROM scoring_events');
  await conn.query('DELETE FROM match_assists');
  await conn.query('DELETE FROM match_state_events');
  await conn.query('UPDATE match_participations SET parent_participation_id=NULL WHERE parent_participation_id IS NOT NULL');
  await conn.query('DELETE FROM match_participations');
  await conn.query('DELETE FROM tournament_advancement_slots');
  await conn.query('DELETE FROM matches');
  await conn.query('DELETE FROM tournament_group_cities');
  await conn.query('DELETE FROM tournament_groups');
  await conn.query('DELETE FROM tournament_events');
  await conn.query('DELETE FROM tournament_stages');

  await conn.query('DELETE FROM qualification_referrals');
  await conn.query('DELETE FROM qualification_events');
  await conn.query('DELETE FROM city_memberships');
  await conn.query('DELETE FROM season_cities');
  await conn.query('DELETE FROM season_device_claims');
  await conn.query('DELETE FROM identity_integrity_events');
  await conn.query('DELETE FROM moderation_cases');

  await conn.query("UPDATE users u JOIN admin_credentials ac ON ac.user_id=u.id SET u.role='ADMIN'");

  await conn.query(`
    UPDATE audit_log al
    JOIN users u ON u.id=al.actor_user_id
    SET al.actor_user_id=NULL
    WHERE u.role<>'ADMIN'
  `);
  await conn.query(`
    UPDATE platform_settings ps
    JOIN users u ON u.id=ps.updated_by_user_id
    SET ps.updated_by_user_id=NULL
    WHERE u.role<>'ADMIN'
  `);
  await conn.query(`
    DELETE s FROM identity_sessions s
    JOIN users u ON u.id=s.user_id
    WHERE u.role<>'ADMIN'
  `);

  await conn.query('UPDATE users SET home_city_id=NULL WHERE home_city_id IS NOT NULL');
  await conn.query('DELETE FROM cities');
  await conn.query("DELETE FROM users WHERE role<>'ADMIN'");

  await conn.query('DELETE FROM seasons');
  await conn.query("INSERT INTO seasons(id,name,status,starts_at,ends_at) VALUES (1,'Somali Cup','QUALIFICATION',NULL,NULL)");

  return {
    competitions:0,
    cities:0,
    supporters:0,
    playerUsers:0,
    matches:0,
    message:'Factory reset complete'
  };
}
