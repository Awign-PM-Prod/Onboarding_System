import { useEffect, useState } from 'react';
import { detectMobileOs } from '../lib/detectMobileOs';

export const UAN_VIDEOS = {
  creation: {
    title: 'UAN registration / generation',
    url: 'https://youtube.com/shorts/bfAkCkXWWjo',
  },
  activation: {
    title: 'UAN activation',
    url: 'https://youtube.com/shorts/-zJzwxRIKHY',
  },
  faceAuth: {
    title: 'Face authentication via UMANG',
    url: 'https://www.youtube.com/shorts/aHcjOi3vGgE',
  },
};

/** Equal width for UMANG / Aadhaar FaceRD panels (fits the wider row). */
const APP_LINKS_PANEL_CLASS =
  'box-border w-full shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 sm:w-[18.75rem]';

export const UAN_APPS = {
  umang: {
    label: 'UMANG',
    android: 'https://play.google.com/store/apps/details?id=in.gov.umang.negd.g2c&hl=en_IN',
    ios: 'https://apps.apple.com/in/app/umang/id1236448857',
  },
  faceRd: {
    label: 'Aadhaar FaceRD',
    android: 'https://play.google.com/store/apps/details?id=in.gov.uidai.facerd&hl=en_IN',
    ios: 'https://apps.apple.com/in/app/aadhaarfacerd/id6479888451',
  },
};

function youtubeEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/shorts/')) {
      const id = parsed.pathname.split('/shorts/')[1]?.split('/')[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    const watchId = parsed.searchParams.get('v');
    if (watchId) return `https://www.youtube.com/embed/${watchId}`;
  } catch {
    // ignore
  }
  return null;
}

function IconPlay({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconExternal({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H18m0 0v4.5M18 6l-7.5 7.5" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 7.5A1.5 1.5 0 017.5 6H9m7.5 9v1.5A1.5 1.5 0 0115 18H7.5A1.5 1.5 0 016 16.5V9a1.5 1.5 0 011.5-1.5H9"
      />
    </svg>
  );
}

function YoutubeVideoModal({ open, onClose, title, url }) {
  const embedUrl = youtubeEmbedUrl(url);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-3xl rounded-xl bg-white p-4 shadow-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
        {embedUrl ? (
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            <iframe
              src={`${embedUrl}?autoplay=1`}
              title={title}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">
              Open video in a new tab
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

function VideoAction({ video, onWatch, className = '' }) {
  return (
    <button
      type="button"
      onClick={() => onWatch(video)}
      className={`inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 transition hover:bg-indigo-100 ${className}`}
    >
      <IconPlay className="h-4 w-4 shrink-0" />
      <span className="text-left">Watch</span>
    </button>
  );
}

function SingleAppLinks({ appKey, deviceOs }) {
  const app = UAN_APPS[appKey];
  if (!app) return null;

  const showAndroid = deviceOs === 'android' || deviceOs === 'other';
  const showIos = deviceOs === 'ios' || deviceOs === 'other';

  return (
    <div className={APP_LINKS_PANEL_CLASS}>
      <div className="flex items-center justify-between gap-2">
        <p className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{app.label}</p>
        <div className="flex shrink-0 gap-1.5">
          {showAndroid && (
            <a
              href={app.android}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100"
            >
              Android
              <IconExternal className="h-3 w-3" />
            </a>
          )}
          {showIos && (
            <a
              href={app.ios}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100"
            >
              iOS
              <IconExternal className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function VideoWithAppRow({ video, appKey, deviceOs, onWatch }) {
  return (
    <div className="flex w-full max-w-full flex-col gap-2 sm:flex-row sm:items-center">
      <VideoAction video={video} onWatch={onWatch} className="w-full shrink-0 sm:w-auto" />
      <div className="self-end sm:ml-auto">
        <SingleAppLinks appKey={appKey} deviceOs={deviceOs} />
      </div>
    </div>
  );
}

function useMobileOs() {
  const [deviceOs, setDeviceOs] = useState(() => detectMobileOs());

  useEffect(() => {
    setDeviceOs(detectMobileOs());
  }, []);

  return deviceOs;
}

function WorkflowStep({ stepNumber, title, description, children }) {
  return (
    <li className="relative flex gap-4">
      <div className="flex shrink-0 flex-col items-center">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
          {stepNumber}
        </span>
        <span className="step-connector mt-1 w-px flex-1 bg-slate-200" aria-hidden />
      </div>
      <div className="step-body min-w-0 flex-1 pb-6">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        {description && <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p>}
        {children && <div className="mt-3 space-y-3">{children}</div>}
      </div>
    </li>
  );
}

export default function UanWorkflowGuide({ path, uanNumberField, screenshotField }) {
  const [activeVideo, setActiveVideo] = useState(null);
  const deviceOs = useMobileOs();

  if (path !== 'yes' && path !== 'no') return null;

  const onWatch = (video) => setActiveVideo(video);
  const videoRow = (video, appKey) => (
    <VideoWithAppRow video={video} appKey={appKey} deviceOs={deviceOs} onWatch={onWatch} />
  );

  return (
    <>
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {path === 'yes' ? 'Steps for existing UAN' : 'Steps to create and activate UAN'}
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            Follow each step on your phone. Use the videos and app links below. Your mobile number must be linked with
            Aadhaar, with camera access and good lighting for face authentication.
          </p>
        </div>

        <ol className="list-none [&>li:last-child_.step-connector]:hidden [&>li:last-child_.step-body]:pb-0">
          {path === 'yes' ? (
            <>
              <WorkflowStep
                stepNumber={1}
                title="Enter your existing UAN"
                description="Provide your 12-digit PF UAN number linked with your Aadhaar."
              >
                {uanNumberField}
              </WorkflowStep>
              <WorkflowStep
                stepNumber={2}
                title="Complete UAN activation in UMANG"
                description="Watch the video to complete UAN activation."
              >
                {videoRow(UAN_VIDEOS.activation, 'umang')}
              </WorkflowStep>
              <WorkflowStep
                stepNumber={3}
                title="Complete face authentication"
                description="Watch the video to complete face authentication."
              >
                {videoRow(UAN_VIDEOS.faceAuth, 'faceRd')}
              </WorkflowStep>
              <WorkflowStep
                stepNumber={4}
                title="Upload confirmation screenshot"
                description="Upload a screenshot that clearly shows successful face authentication."
              >
                {screenshotField}
              </WorkflowStep>
            </>
          ) : (
            <>
              <WorkflowStep
                stepNumber={1}
                title="Watch UAN creation guide"
                description="Learn how to generate a new UAN using the UMANG app."
              >
                {videoRow(UAN_VIDEOS.creation, 'umang')}
              </WorkflowStep>
              <WorkflowStep
                stepNumber={2}
                title="Enter your generated UAN"
                description="Copy the 12-digit UAN you received and enter it below."
              >
                {uanNumberField}
              </WorkflowStep>
              <WorkflowStep
                stepNumber={3}
                title="Complete UAN activation"
                description="Watch the video to complete UAN activation."
              >
                {videoRow(UAN_VIDEOS.activation, 'umang')}
              </WorkflowStep>
              <WorkflowStep
                stepNumber={4}
                title="Complete face authentication"
                description="Watch the video to complete face authentication."
              >
                {videoRow(UAN_VIDEOS.faceAuth, 'faceRd')}
              </WorkflowStep>
              <WorkflowStep
                stepNumber={5}
                title="Upload confirmation screenshot"
                description="Upload a screenshot showing successful face authentication."
              >
                {screenshotField}
              </WorkflowStep>
            </>
          )}
        </ol>
      </div>

      <YoutubeVideoModal
        open={Boolean(activeVideo)}
        onClose={() => setActiveVideo(null)}
        title={activeVideo?.title ?? 'Video'}
        url={activeVideo?.url ?? ''}
      />
    </>
  );
}
