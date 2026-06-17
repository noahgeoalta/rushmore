      {/* Full-width black strip — video frame is centred inside at max 900px */}
      <div className="ai-video-strip">
        <div className="ai-video-sticky">
          <video
            src={VIDEO_SRC}
            autoPlay loop muted playsInline
            className="ai-video-main"
          />
          {/* Bloom overlay — ON TOP of video, mix-blend-mode:screen, JS sets bg every frame */}
          <div className="ai-video-bloom" ref={bloomRef} />
        </div>
      </div>
