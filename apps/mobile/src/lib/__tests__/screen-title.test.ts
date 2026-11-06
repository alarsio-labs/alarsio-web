import { screenTitle, shortSiteName } from '../screen-title';

describe('screenTitle', () => {
  it('joins the screen and the site name', () => {
    expect(screenTitle('day_register', 'Baner Tower A')).toBe('Day register · Baner Tower A');
    expect(screenTitle('check_in', 'Baner Tower A')).toBe('Check in · Baner Tower A');
    expect(screenTitle('daily_report', 'Baner Tower A')).toBe('Daily report · Baner Tower A');
    expect(screenTitle('site_materials', 'Baner Tower A')).toBe('Materials · Baner Tower A');
  });

  it('uses a fixed title for list screens and before a site has loaded', () => {
    expect(screenTitle('attendance_sites')).toBe('Attendance');
    expect(screenTitle('report_sites')).toBe('Daily reports');
    expect(screenTitle('materials_sites')).toBe('Materials');
    expect(screenTitle('help')).toBe('Help');
    expect(screenTitle('day_register', '')).toBe('Day register');
  });

  it('cuts a long site name to 22 characters ending in an ellipsis', () => {
    const cut = shortSiteName('Kothrud Residency Phase Two Block C');
    expect(cut.length).toBe(22);
    expect(cut.endsWith('…')).toBe(true);
    expect(shortSiteName('Exactly twenty-two chr')).toBe('Exactly twenty-two chr');
  });
});
