// 이병조님 실측 데이터 시드 (2026-04-09 ~ 2026-05-12)
// 명세서 1.0 기준
window.BG_SEED = (function () {
  const ts = (s) => new Date(s).getTime();

  const records = [
    // 공복혈당 (fasting)
    { type: 'glucose', at: ts('2026-04-09T08:47'), value: 124, context: 'fasting', note: '진단 전' },
    { type: 'glucose', at: ts('2026-04-10T08:35'), value: 108, context: 'fasting', note: '진단 전' },
    { type: 'glucose', at: ts('2026-04-13T08:40'), value: 142, context: 'fasting', note: '진단 전' },
    { type: 'glucose', at: ts('2026-04-16T08:25'), value: 153, context: 'fasting', note: '진단 전' },
    { type: 'glucose', at: ts('2026-04-17T06:04'), value: 210, context: 'fasting', note: '확진 + 약 시작일' },
    { type: 'glucose', at: ts('2026-04-19T09:48'), value: 113, context: 'fasting', note: '약 효과 시작' },
    { type: 'glucose', at: ts('2026-04-22T08:12'), value: 112, context: 'fasting', note: '' },
    { type: 'glucose', at: ts('2026-04-24T08:49'), value: 124, context: 'fasting', note: '' },
    { type: 'glucose', at: ts('2026-04-25T12:46'), value: 104, context: 'fasting', note: '늦잠 후' },
    { type: 'glucose', at: ts('2026-04-26T09:55'), value: 109, context: 'fasting', note: '' },
    { type: 'glucose', at: ts('2026-04-27T07:54'), value: 113, context: 'fasting', note: '' },
    { type: 'glucose', at: ts('2026-04-29T06:04'), value: 180, context: 'fasting', note: '음주 사고 다음날' },
    { type: 'glucose', at: ts('2026-04-30T08:27'), value: 116, context: 'fasting', note: '회복' },
    { type: 'glucose', at: ts('2026-05-01T10:20'), value: 104, context: 'fasting', note: '정상 진입' },
    { type: 'glucose', at: ts('2026-05-02T09:35'), value: 118, context: 'fasting', note: '' },
    { type: 'glucose', at: ts('2026-05-03T09:55'), value: 110, context: 'fasting', note: '' },
    { type: 'glucose', at: ts('2026-05-04T08:40'), value: 123, context: 'fasting', note: '' },
    { type: 'glucose', at: ts('2026-05-05T08:50'), value: 135, context: 'fasting', note: '연휴 누적 효과' },
    { type: 'glucose', at: ts('2026-05-07T07:46'), value: 108, context: 'fasting', note: '회복' },
    { type: 'glucose', at: ts('2026-05-08T07:34'), value: 120, context: 'fasting', note: '어버이날' },
    { type: 'glucose', at: ts('2026-05-09T08:54'), value: 118, context: 'fasting', note: '' },
    { type: 'glucose', at: ts('2026-05-11T08:13'), value: 119, context: 'fasting', note: '' },
    { type: 'glucose', at: ts('2026-05-12T07:44'), value: 189, context: 'fasting', note: '음주+야식+라면+만두+밥+소주 1병' },

    // 식후/식전
    { type: 'glucose', at: ts('2026-04-15T10:26'), value: 155, context: 'after_meal', note: '확진 전' },
    { type: 'glucose', at: ts('2026-04-15T15:01'), value: 261, context: 'after_meal', note: '확진 전' },
    { type: 'glucose', at: ts('2026-04-15T18:27'), value: 180, context: 'after_meal', note: '확진 전' },
    { type: 'glucose', at: ts('2026-04-17T15:26'), value: 134, context: 'after_meal', note: '약 시작 당일' },
    { type: 'glucose', at: ts('2026-04-18T18:15'), value: 105, context: 'before_meal', note: '' },
    { type: 'glucose', at: ts('2026-04-24T15:26'), value: 120, context: 'after_meal', note: '' },
    { type: 'glucose', at: ts('2026-05-08T16:25'), value: 84, context: 'after_meal_4h', note: '식후 4시간' },
    { type: 'glucose', at: ts('2026-05-12T16:47'), value: 94, context: 'after_meal_4h', note: '점심 식후 4시간' },
    { type: 'glucose', at: ts('2026-05-12T21:42'), value: 178, context: 'after_meal', note: '비빔국수 식후 2시간' },
    { type: 'glucose', at: ts('2026-05-12T23:00'), value: 129, context: 'random', note: '걷기 1시간 후' },

    // 핵심 운동/식사 기록
    { type: 'exercise', at: ts('2026-05-12T21:50'), value: '제자리걷기', duration: 78, note: '식후 -49 효과' },
    { type: 'meal', at: ts('2026-05-12T19:30'), value: '비빔국수', carbs: null, note: '야식' },
    { type: 'meal', at: ts('2026-05-11T22:30'), value: '라면 + 만두 + 밥 + 소주 1병', carbs: null, note: '음주 야식' },
  ];

  // id 부여
  let i = 0;
  for (const r of records) {
    r.id = 'seed-' + (i++).toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  }

  return {
    records,
    profile: {
      name: '이병조',
      birthYear: 1978,
      diagnosisDate: '2026-04-17',
      diagnosisGlucose: 210,
      hospital: '삼성민내과',
      doctor: '김지혁',
    },
    prescription: {
      startDate: '2026-04-17',
      endDate: '2026-06-16',
      reminderTime: '08:00',
      medications: [
        { id: 'jardiance', name: '자디앙듀오', dose: '12.5/1000mg', timing: '아침 식후', warning: '음주 시 위험 (케톤산증·저혈당·탈수). 매일 물 2L 이상.' },
        { id: 'trajenta', name: '트라젠타', dose: '5mg', timing: '아침 식후', warning: '' },
        { id: 'rosurod', name: '로수로드', dose: '5mg', timing: '아침 식후', warning: '콜레스테롤 (스타틴)' },
        { id: 'eudina', name: '유디나캡슐', dose: '-', timing: '아침 식후', warning: '보조제' },
      ],
    },
  };
})();
