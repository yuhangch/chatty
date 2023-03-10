window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        close_setting_modal()
        showHistory(false)
    }
    // if ((e.ctrlKey || e.altKey)) {
    //   // console.log(e.key);
    //   switch (e.key) {
    //     case "i":
    //       e.preventDefault()
    //       reset()
    //       break;
    //     case ",":
    //       e.preventDefault()
    //       showSettings(true)
    //       break;
    //     case "h":
    //       e.preventDefault()
    //       showHistory(true)
    //       break;
    //     case ";":
    //       e.preventDefault()
    //       config.multi = !config.multi
    //       addItem("system", "Long conversation checked: " + config.multi)
    //       break;
    //
    //     default:
    //       break;
    //   }
    // }
}, {passive: false})

// line.addEventListener("keydown", (e) => {
//   if (e.key == "Enter" && (e.ctrlKey || e.altKey)) {
//     e.preventDefault()
//     onSend()
//   }
// })

message_box.addEventListener("paste", (e) => {
    e.preventDefault()

    let clipboardData = (e.clipboardData || window.clipboardData)
    let paste = clipboardData.getData("text/plain")
        .toString()
        .replaceAll("\r\n", "\n")
    message_box.focus()
    document.execCommand("insertText", false, paste)
}, {passive: false})

function onSend() {
    var value = (message_box.value || message_box.innerText).trim()

    if (!value) return

    addItem("user", value)
    postLine(value)

    message_box.value = ""
    message_box.innerText = ""
}

function addItem(type, content) {
    let request = document.createElement("div")
    request.className = type
    request.innerText = content
    message_container.appendChild(request)

    window.scrollTo({
        top: document.body.scrollHeight, behavior: "auto",
    })
    message_box.focus()

    return request
}

function postLine(line) {
    saveConv({role: "user", content: line})
    let reqMsgs = []
    if (messages.length < 10) {
        reqMsgs.push(...messages)
    } else {
        reqMsgs.push(messages[0])
        reqMsgs.push(...messages.slice(messages.length - 7, messages.length))
    }
    if (config.model === "gpt-3.5-turbo") {
        chat(reqMsgs)
    } else {
        completions(reqMsgs)
    }
}

var convId;
var messages = [];

function chat(reqMsgs) {
    let assistantElem = addItem('', '')
    let _message = reqMsgs
    if (!config.multi) {
        _message = [reqMsgs[0], reqMsgs[reqMsgs.length - 1]]
    }
    send(`${config.domain}/v1/chat/completions`, {
        "model": "gpt-3.5-turbo",
        "messages": _message,
        "max_tokens": config.maxTokens,
        "stream": config.stream,
        "temperature": config.temperature,
    }, (data) => {
        let msg = data.choices[0].delta || data.choices[0].message || {}
        assistantElem.className = 'assistant'
        assistantElem.innerText += msg.content || ""
    }, () => {
        let msg = assistantElem.innerText
        saveConv({role: "assistant", content: msg})
        // textToSpeech(msg)
    })
}

function completions(reqMsgs) {
    let assistantElem = addItem('', '')
    let _prompt = ""
    if (config.multi) {
        reqMsgs.forEach(msg => {
            _prompt += `${msg.role}: ${msg.content}\n`
        });
    } else {
        _prompt += `${reqMsgs[0].role}: ${reqMsgs[0].content}\n`
        let lastMessage = reqMsgs[reqMsgs.length - 1]
        _prompt += `${lastMessage.role}: ${lastMessage.content}\n`
    }
    _prompt += "assistant: "
    send(`${config.domain}/v1/completions`, {
        "model": config.model,
        "prompt": _prompt,
        "max_tokens": config.maxTokens,
        "stop": ["\nuser: ", "\nassistant: "],
        "stream": config.stream,
        "temperature": config.temperature,
    }, (data) => {
        assistantElem.className = 'assistant'
        assistantElem.innerText += data.choices[0].text
    }, () => {
        let msg = assistantElem.innerText
        saveConv({role: "assistant", content: msg})
    })
}

function send(reqUrl, body, onMessage, scussionCall) {
    loader.hidden = false
    let onError = (data) => {
        console.error(data);
        loader.hidden = true
        if (!data) {
            addItem("system", `Unable to access OpenAI, please check your network.`)
        } else {
            try {
                let openai = JSON.parse(data)
                addItem("system", `${openai.error.message}`)
            } catch (error) {
                addItem("system", `${data}`)
            }
        }
    }
    if (config.stream) {
        var source = new SSE(
            reqUrl, {
                headers: {
                    "Authorization": "Bearer " + config.apiKey,
                    "Content-Type": "application/json",
                },
                method: "POST",
                payload: JSON.stringify(body),
            });

        source.addEventListener("message", function (e) {
            if (e.data == "[DONE]") {
                loader.hidden = true
                scussionCall()
            } else {
                try {
                    onMessage(JSON.parse(e.data))
                } catch (error) {
                    onError(error)
                }
            }
        });

        source.addEventListener("error", function (e) {
            onError(e.data)
        });

        source.stream();
    } else {
        fetch(reqUrl, {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + config.apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        }).then((resp) => {
            return resp.json()
        }).then((data) => {
            loader.hidden = true
            if (data.error) {
                throw new Error(`${data.error.code}: ${data.error.message}`)
            }
            onMessage(data)
            scussionCall()
        }).catch(onError)
    }
}

function reset() {
    message_container.innerHTML = ''
    convId = uuidv4();
    messages = [config.firstPrompt]
    addItem(config.firstPrompt.role, config.firstPrompt.content)
}

const convKey = "conversations_"

function saveConv(message) {
    messages.push(message)
    localStorage.setItem(`${convKey}${convId}`, JSON.stringify(messages))
}

function switchConv(key) {
    if (key == null) {
        addItem("system", "No conversations")
        return
    }
    message_container.innerHTML = ''
    messages = JSON.parse(localStorage.getItem(key))
    messages.forEach(msg => {
        addItem(msg.role, msg.content)
    });
    convId = key.substring(convKey.length);
}

function deleteConv(key) {
    localStorage.removeItem(key)
}

function showHistory(ok = true) {
    if (ok) {
        historyModal.style.display = ''
        historyList.innerHTML = ''
        for (let index = 0; index < localStorage.length; index++) {
            let key = localStorage.key(index);
            if (key.substring(0, convKey.length) != convKey) {
                continue
            }
            let itemJson = localStorage.getItem(key)
            let itemData;
            try {
                itemData = JSON.parse(itemJson)
            } catch (error) {
                continue
            }
            historyList.innerHTML += `<div class="history-item">
        <div style="flex: 1;" onclick='switchConv("${key}"); showHistory(false);'>
          <div>SYST: ${itemData[0].content}</div>
          <div>USER: ${itemData[1].content} (${itemData.length}+)</div>
        </div>
        <button onclick='deleteConv("${key}"); showHistory(true);' class="icon" title="Delete">❌</button>
</div>`
        }
        if (0 == localStorage.length) {
            historyList.innerHTML = `<h4>There are no past conversations yet.</h4>`
        } else {
        }
    } else {
        historyModal.style.display = 'none'
    }
}


function setSettingInput(config) {
    domainInput.placeholder = "https://api.openai.com"
    maxTokensInput.placeholder = config.maxTokens
    systemPromptInput.placeholder = "You are a helpful assistant."
    temperatureInput.placeholder = config.temperature

    apiKeyInput.value = config.apiKey

    if (!config.domain) {
        config.domain = domainInput.placeholder
    } else {
        domainInput.value = config.domain
    }
    if (!config.maxTokens) {
        config.maxTokens = parseInt(maxTokensInput.placeholder)
    } else {
        maxTokensInput.value = config.maxTokens
    }
    if (!config.temperature) {
        config.temperature = parseInt(temperatureInput.placeholder)
    } else {
        temperatureInput.value = config.temperature
    }
    if (!config.model) {
        config.model = "gpt-3.5-turbo"
    }
    modelInput.value = config.model
    if (!config.firstPrompt) {
        config.firstPrompt = {role: "system", content: systemPromptInput.placeholder}
    } else {
        systemPromptInput.value = config.firstPrompt.content
    }
    multiConvInput.checked = config.multi
}

var config = {
    domain: "",
    apiKey: "",
    maxTokens: 500,
    model: "",
    firstPrompt: null,
    multi: true,
    stream: true,
    prompts: [],
    temperature: 0.5,
}

function saveSettings() {
    if (!apiKeyInput.value) {
        alert('OpenAI API key can not empty')
        return
    }
    config.domain = domainInput.value || domainInput.placeholder
    config.apiKey = apiKeyInput.value
    config.maxTokens = parseInt(maxTokensInput.value || maxTokensInput.placeholder)
    config.temperature = parseInt(temperatureInput.value || temperatureInput.placeholder)
    config.model = modelInput.value
    console.log(222)
    if (systemPromptInput.value) {
        config.firstPrompt = {
            role: "system",
            content: (systemPromptInput.value || systemPromptInput.placeholder)
        }
    }
    messages[0] = config.firstPrompt
    config.multi = multiConvInput.checked
    message_container.firstChild.innerHTML = config.firstPrompt.content
    localStorage.setItem("conversation_config", JSON.stringify(config))
    // open_setting_modal()
    close_setting_modal()
    addItem('system', 'Update successed')
}

function onSelectPrompt(index) {
    let prompt = config.prompts[index]
    systemPromptInput.value = prompt.content
    multiConvInput.checked = prompt.multi
    promptDetails.open = false
}

const promptDiv = (index, prompt) => {
    return `<div style="margin-top: 15px; cursor: pointer;" onclick="onSelectPrompt(${index})">
<div style="display: flex;">
  <strong style="flex: 1;">${prompt.title}</strong>
  <label style="display:  ${prompt.multi ? "" : "none"}; align-items: center; margin: 0">
<!--    <span style="white-space: nowrap;">Long conversation</span>-->
<!--    <input type="checkbox" style="width: 1.1rem; height: 1.1rem;" checked disabled/>-->
  </label>
</div>
<div style="margin-top: 2px;">${prompt.content}</div>
</div>`
}

function init() {
    fetch("prompts.json").then(resp => {
        if (!resp.ok) {
            throw new Error(resp.statusText)
        }
        return resp.json()
    }).then(data => {
        config.prompts = data
        for (let index = 0; index < data.length; index++) {
            const prompt = data[index];
            promptList.innerHTML += promptDiv(index, prompt)
        }
    })
    let configJson = localStorage.getItem("conversation_config")
    let _config = JSON.parse(configJson)
    if (_config) {
        let ck = Object.keys(config)
        ck.forEach(key => {
            config[key] = _config[key] || config[key]
        });
        setSettingInput(config)

    } else {
        open_setting_modal()
    }


    // reset()
}

window.scrollTo(0, document.body.clientHeight)
init()

