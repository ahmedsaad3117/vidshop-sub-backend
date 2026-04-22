export class UsageStatsDto {
  currentPeriod!: {
    videosGenerated: number;
    videosLimit: number;
    videosRemaining: number;
    videosPercentUsed: number;
    textsGenerated: number;
    textsLimit: number;
    textsRemaining: number;
    textsPercentUsed: number;
    periodStart: Date;
    periodEnd: Date;
    daysRemaining: number;
  };

  subscription!: {
    tierName: string;
    tierDisplayName: string;
    status: string;
  };

  history!: {
    totalVideosAllTime: number;
    totalTextsAllTime: number;
    totalSuccessful: number;
    totalFailed: number;
  };
}
