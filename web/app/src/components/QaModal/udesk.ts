const UDESK_CODE = '2476e31b';
export const UDESK_LINK =
  'https://1500735.s4.udesk.cn/im_client/?web_plugin_id=60650';
const UDESK_SCRIPT = 'https://assets-cli.s4.udesk.cn/im_client/js/udeskApi.js';

type UdeskArgs =
  | ['showPanel']
  | [
      {
        code: string;
        link: string;
        targetSelector: string;
        panel: { onToggle: (data: { visible: boolean }) => void };
      },
    ];
type Udesk = ((...args: UdeskArgs) => void) & { d?: UdeskArgs[] };
type UdeskWindow = Window & { UdeskApiObject?: string; ud?: Udesk };
let udeskReady: Promise<Udesk> | undefined;
let panelVisible = false;
let onPanelOpened: (() => void) | undefined;
let opening: Promise<void> | undefined;

export const shouldOfferHumanSupport = (
  question: string,
  answer: string,
  score: number,
) => {
  const intent = question.trim().replace(/[。！？!?]+$/u, '');
  return (
    score === -1 ||
    score === 4 ||
    /^(?:请|帮我|我要|我想|请帮我)?(?:转接?|找|联系)?(?:人工(?:客服|坐席)?|客服)(?:吧|吗|可以吗)?$/u.test(
      intent,
    ) ||
    /^(?:试过了[，, ]*)?(?:没解决|没有解决|未解决|还是不行)$/u.test(intent) ||
    /无法回答|无法解决|不能解决|请联系[^，。\n]*人工客服|需要[^，。\n]*客服(?:核实|处理)/u.test(
      answer,
    )
  );
};
const loadUdesk = () => {
  const browser = window as UdeskWindow;
  if (!udeskReady) {
    udeskReady = new Promise<Udesk>((resolve, reject) => {
      const targetId = 'zhixiaocai-udesk-target';
      if (!document.getElementById(targetId)) {
        const target = document.createElement('span');
        target.id = targetId;
        target.style.setProperty('display', 'none', 'important');
        document.body.append(target);
      }
      browser.UdeskApiObject = 'ud';
      if (browser.ud) {
        reject(new Error('Udesk is already initialized elsewhere'));
        return;
      }
      const queued: Udesk = (...args) => {
        (queued.d ??= []).push(args);
      };
      browser.ud = queued;
      queued({
        code: UDESK_CODE,
        link: UDESK_LINK,
        targetSelector: '#' + targetId,
        panel: {
          onToggle: ({ visible }) => {
            panelVisible = visible;
            if (visible) onPanelOpened?.();
          },
        },
      });
      const script = document.createElement('script');
      script.async = true;
      script.src = UDESK_SCRIPT;
      const fail = () => {
        window.clearTimeout(timeout);
        if (browser.ud === queued) delete browser.ud;
        script.remove();
        reject(new Error('Udesk script failed to load'));
      };
      const timeout = window.setTimeout(fail, 5000);
      script.onerror = fail;
      script.onload = () => {
        window.clearTimeout(timeout);
        resolve(browser.ud ?? queued);
      };
      document.head.appendChild(script);
    }).catch(error => {
      udeskReady = undefined;
      throw error;
    });
  }
  return udeskReady;
};

export const openUdesk = () => {
  if (!opening) {
    opening = loadUdesk()
      .then(ud => {
        if (panelVisible) return;
        return new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            reject(new Error('Udesk panel did not open'));
          }, 2500);
          onPanelOpened = () => {
            window.clearTimeout(timeout);
            resolve();
          };
          try {
            ud('showPanel');
          } catch (error) {
            window.clearTimeout(timeout);
            reject(error);
          }
        });
      })
      .finally(() => {
        onPanelOpened = undefined;
        opening = undefined;
      });
  }
  return opening;
};
