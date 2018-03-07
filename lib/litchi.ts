export function makeLitchiMission(steps, actions: LitchiAction[]): string {
    const header = 'latitude,longitude,altitude(m),heading(deg),curvesize(m),rotationdir,gimbalmode,gimbalpitchangle,actiontype1,actionparam1,actiontype2,actionparam2,actiontype3,actionparam3,actiontype4,actionparam4,actiontype5,actionparam5,actiontype6,actionparam6,actiontype7,actionparam7,actiontype8,actionparam8,actiontype9,actionparam9,actiontype10,actionparam10,actiontype11,actionparam11,actiontype12,actionparam12,actiontype13,actionparam13,actiontype14,actionparam14,actiontype15,actionparam15';

    const missionSteps = steps.map(step => {
        const missionStep = [
            step.geoPoint.lat,
            step.geoPoint.lon,
            step.shootingPoint.y, // height
            step.heading,
            0,
            0,
            2, // ajust gimbal to the concrete angle
            step.viewAngleToTheGround // gimbal angle (-90:30)
        ];

        for (const action of actions) {
            switch (action.type) {
                case 'wait':
                    missionStep.push(0);
                    break;
                case 'photo':
                    missionStep.push(1);
                    break;
                default:
                    missionStep.push(-1)
            }
            missionStep.push(action.param || 0)
        }

        const emptyActionsCount = 15 - ((missionStep.length - 8) / 2);
        for (let i = 0; i < emptyActionsCount; i++) {
            missionStep.push(-1, 0)
        }

        return missionStep;
    });

    return header + '\n' + missionSteps.map(missionStep => missionStep.join(',')).join('\n')
}

export interface LitchiAction {
    type: 'wait' | 'photo',
    param?: string | number
}