
import { GoogleGenAI, Type } from "@google/genai";
import { Scene } from "../types";

export class GeminiService {
  private static readonly CAMERA_STYLES = `
    1. SLOW DOLLY IN (PUSH): Glides forward, expanding background perspective.
    2. SLOW DOLLY OUT (PULL): Tracks backward, revealing environment.
    3. FAST DOLLY IN / RUSH: Surges forward for immediate urgency.
    4. DOLLY ZOOM: "Vertigo" effect, warps background while locking subject scale.
    5. MACRO ZOOM: From face to microscopic/cellular structures.
    6. COSMIC HYPER-ZOOM: Orbit to street, unbroken race from space to Earth.
    7. OVER-THE-SHOULDER (OTS): Frames primary subject from secondary figure's shoulder.
    8. FISHEYE / PEEPHOLE: Ultra-wide distortion, center bulge.
    9. LATERAL WIPE REVEAL: Starts obscured by foreground, slides to reveal.
    10. FLY THROUGH: Glides through a narrow opening or window.
    11. FOCUS-PULL REVEAL: Opens defocused (bokeh), pulls into sharp clarity.
    12. RACK FOCUS: Foreground to background focus shift mid-shot.
    13. SLOW TILT UP: Vertical rise from boots to face.
    14. SLOW TILT DOWN: Vertical descent from face to boots.
    15. TRUCK LEFT: Lateral glide left creating pronounced parallax.
    16. TRUCK RIGHT: Lateral glide right creating pronounced parallax.
    17. HALF ORBIT (180): Transitions from frontal profile to rear view.
    18. FAST 360 ORBIT (SPIN): Whips in full circle, blurring environment.
    19. SLOW CINEMATIC ARC: Gentle, wide curve revealing side profile.
    20. PEDESTAL DOWN: Body lowers vertically eye to waist level.
    21. PEDESTAL UP: Body rises vertically waist to eye level.
    22. CRANE UP: Rises and pulls back to high-angle overhead.
    23. CRANE DOWN: Glides from bird's-eye to eye level.
    24. OPTICAL ZOOM IN: Fixed camera, lens advances, compressing depth.
    25. OPTICAL ZOOM OUT: Fixed camera, lens pulls wider, expanding context.
    26. SNAP ZOOM (CRASH): Instantaneous lens punch into eyes.
    27. DRONE FLYOVER: High-altitude stable aerial push.
    28. EPIC DRONE REVEAL: Rises behind ridge, tilts down to unveil horizon.
    29. DRONE ORBIT: Large scale aerial circle around structure.
    30. TOP-DOWN (GOD'S EYE): 90° overhead, slowly rotating.
    31. FPV DRONE DIVE: Aggressive plunge down facades.
    32. HANDHELD: Documentary style with natural micro-jitters/sway.
    33. WHIP PAN: Aggressive lateral snap with motion blur.
    34. DUTCH ANGLE (ROLL): Horizon cuts diagonally through the shot.
    35. LEADING SHOT: Backward tracking retreating from subject.
    36. FOLLOWING SHOT: Forward tracking advancing behind subject.
    37. SIDE TRACKING: Parallel truck locked profile matching pace.
    38. POV WALK: First-person perspective with step bob.
  `;

  private static async withRetry<T>(fn: () => Promise<T>, retries = 5, delay = 5000): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const errorStr = JSON.stringify(error).toLowerCase();
      // Detecta erro 429 em vários formatos possíveis (SDK, Fetch ou Mensagem direta)
      const isQuotaError = 
        error.message?.includes("429") || 
        error.message?.includes("quota") || 
        error.status === 429 ||
        errorStr.includes("429") ||
        errorStr.includes("resource_exhausted") ||
        errorStr.includes("quota exceeded");
      
      if (retries > 0 && isQuotaError) {
        console.warn(`Aviso: Limite de cota atingido (429). Tentando novamente em ${delay/1000}s... (Tentativa ${6 - retries}/5)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        // Backoff exponencial: aumenta o tempo de espera em 50% a cada falha
        return this.withRetry(fn, retries - 1, delay * 1.5);
      }
      throw error;
    }
  }

  static async analyzeScript(script: string, targetSceneCount: number): Promise<Scene[]> {
    return this.withRetry(async () => {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Você é um Diretor de Fotografia Profissional. Fragmente este roteiro em EXATAMENTE ${targetSceneCount} cenas de 8 segundos cada para uma narrativa contínua.
        
        REQUISITOS:
        1. Atribua UM movimento de câmera da biblioteca por cena.
        2. Prompts devem começar com o nome do movimento.
        3. Garanta continuidade visual absoluta entre cenas consecutivas.
        
        BIBLIOTECA:
        ${this.CAMERA_STYLES}
        
        ROTEIRO: ${script}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    prompt: { type: Type.STRING }
                  },
                  required: ["title", "description", "prompt"]
                }
              }
            },
            required: ["scenes"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("Falha na análise criativa.");
      
      const data = JSON.parse(text);
      return data.scenes.map((s: any, index: number) => ({
        ...s,
        id: `scene-${index}`,
        status: 'pending'
      }));
    });
  }

  static async generateSceneVideo(
    scene: Scene, 
    previousScene?: Scene,
    mode: 'fast' | 'quality' = 'quality',
    aspectRatio: '16:9' | '9:16' = '16:9',
    referenceImageBase64?: string,
    isSequenced: boolean = false
  ): Promise<{ videoUri: string; blobUrl: string; rawResponse: any }> {
    return this.withRetry(async () => {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let operation;

      const resolution = isSequenced ? '720p' : (mode === 'quality' ? '1080p' : '720p');
      const enhancedPrompt = `${scene.prompt}. cinematic masterpiece, photorealistic, 8k, highly detailed.`;
      const previousVideo = previousScene?.rawResponse?.response?.generatedVideos?.[0]?.video;

      try {
        if (previousVideo) {
          operation = await ai.models.generateVideos({
            model: 'veo-3.1-generate-preview',
            prompt: enhancedPrompt,
            video: previousVideo,
            config: {
              numberOfVideos: 1,
              resolution: '720p',
              aspectRatio: previousVideo.aspectRatio || aspectRatio
            }
          });
        } else {
          const modelName = mode === 'fast' ? 'veo-3.1-fast-generate-preview' : 'veo-3.1-generate-preview';
          const config: any = {
            numberOfVideos: 1,
            resolution: resolution,
            aspectRatio: aspectRatio
          };

          const payload: any = {
            model: modelName,
            prompt: enhancedPrompt,
            config
          };

          if (referenceImageBase64) {
            payload.image = {
              imageBytes: referenceImageBase64.split(',')[1],
              mimeType: 'image/png',
            };
          }

          operation = await ai.models.generateVideos(payload);
        }

        // Poll for completion com retentativa se o polling falhar por cota
        while (!operation.done) {
          await new Promise(resolve => setTimeout(resolve, 10000));
          operation = await this.withRetry(async () => {
             const aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY });
             return aiInstance.operations.getVideosOperation({ operation: operation });
          });
        }

        if (operation.error) {
          const errMsg = operation.error.message || "";
          if (errMsg.includes("Requested entity was not found")) {
              throw new Error("AUTH_ERROR");
          }
          if (errMsg.includes("429") || errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("exhausted")) {
              throw new Error("LIMITE_COTAS");
          }
          throw new Error(errMsg);
        }

        const response = operation.response;
        const downloadLink = response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) throw new Error("Download indisponível.");

        // Fetch do vídeo final também com retentativa caso a URL de download expire ou sofra rate limit
        const videoRes = await this.withRetry(async () => {
            const res = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
            if (!res.ok) {
               if (res.status === 429) throw new Error("LIMITE_COTAS");
               throw new Error(`Erro de rede ao baixar vídeo: ${res.status}`);
            }
            return res;
        });

        const videoBlob = await videoRes.blob();
        const blobUrl = URL.createObjectURL(videoBlob);

        return {
          videoUri: downloadLink,
          blobUrl,
          rawResponse: operation
        };
      } catch (err: any) {
        const errStr = JSON.stringify(err).toLowerCase();
        if (err.message?.includes("Requested entity was not found") || err.message === "AUTH_ERROR" || errStr.includes("not found")) {
          throw new Error("AUTH_ERROR");
        }
        if (err.message?.includes("429") || err.message?.includes("quota") || errStr.includes("429") || errStr.includes("resource_exhausted")) {
          throw new Error("LIMITE_COTAS");
        }
        throw err;
      }
    });
  }
}
