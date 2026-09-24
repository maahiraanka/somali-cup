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

  await conn.query('UPDATE users SET home_city_id=NULL WHERE home_city_id IS NOT NULL');
  await conn.query('DELETE FROM cities');

  return {
    competitions:0,
    cities:0,
    supporters:0,
    matches:0,
    message:'Public competition content cleared'
  };
}
