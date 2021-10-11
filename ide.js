var defaultUrl = localStorageGetItem("api-url") || "https://ce.judge0.com";
var apiUrl = defaultUrl;
var wait = localStorageGetItem("wait") || false;
var check_timeout = 300;

var blinkStatusLine = ((localStorageGetItem("blink") || "true") === "true");
var editorMode = localStorageGetItem("editorMode") || "normal";
var redirectStderrToStdout = ((localStorageGetItem("redirectStderrToStdout") || "false") === "true");
var editorModeObject = null;

var fontSize = 14;

var MonacoVim;
var MonacoEmacs;

var layout;

var sourceEditor;
var dataEditor;
var stdoutEditor;

var isEditorDirty = false;
var currentLanguageId;

var $selectLanguage;
var $compilerOptions;
var $commandLineArguments;
var $insertTemplateBtn;
var $runBtn;
var $navigationMessage;
var $updates;
var $statusLine;

var timeStart;
var timeEnd;


var layoutConfig = {
    settings: {
        showPopoutIcon: false,
        reorderEnabled: true
    },
    dimensions: {
        borderWidth: 3,
        headerHeight: 22
    },
    content: [{
        type: "column",
        content: [{
            type: "component",
            componentName: "source",
            title: "CODE",
            isClosable: false,
            componentState: {
                readOnly: false
            },
        }, {
            type: "row",
            content: [
                {
                type: "column",
                content: [{
                        type: "component",
                        componentName: "stdout",
                        title: "STDOUT",
                        isClosable: false,
                        componentState: {
                            readOnly: true
                        }
                    }]
            },
            {
                type: "column",
                content: [{
                        type: "component",
                        componentName: "stderr",
                        title: "Question",
                        isClosable: false,
                        componentState: {
                            readOnly: true
                        },
                        
                    }]
            }]
        }]
    }]
};

function encode(str) {
    return btoa(unescape(encodeURIComponent(str || "")));
}

function decode(bytes) {
    var escaped = escape(atob(bytes || ""));
    try {
        return decodeURIComponent(escaped);
    } catch {
        return unescape(escaped);
    }
}

function localStorageSetItem(key, value) {
  try {
    localStorage.setItem(key, "false");
  } catch (ignorable) {
  }
}

function localStorageGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (ignorable) {
    return null;
  }
}




function showError(title, content) {
    $("#site-modal #title").html(title);
    $("#site-modal .content").html(content);
    $("#site-modal").modal("show");
}

function handleError(jqXHR, textStatus, errorThrown) {
    showError(`${jqXHR.statusText} (${jqXHR.status})`, `<pre>${JSON.stringify(jqXHR, null, 4)}</pre>`);
}

function handleRunError(jqXHR, textStatus, errorThrown) {
    handleError(jqXHR, textStatus, errorThrown);
    $runBtn.removeClass("loading");
}

function handleResult(data) {
    var stdout = decode(data.stdout);
    if (blinkStatusLine) {
        $statusLine.addClass("blink");
        setTimeout(function() {
            blinkStatusLine = false;
            localStorageSetItem("blink", "false");
            $statusLine.removeClass("blink");
        }, 3000);
    }

    stdoutEditor.setValue(stdout);
    console.log(stdout);                  // ----> here console stdout catching value :)

    if (stdout !== "") {
        var dot = document.getElementById("stdout-dot");
        if (!dot.parentElement.classList.contains("lm_active")) {
            dot.hidden = false;
        }
    }
    $runBtn.removeClass("loading");
}

function getIdFromURI() {
  var uri = location.search.substr(1).trim();
  return uri.split("&")[0];
}



function loadSavedSource() {
    snippet_id = getIdFromURI();

    if (snippet_id.length == 36) {
        $.ajax({
            url: apiUrl + "/submissions/" + snippet_id + "?fields=source_code,language_id,stdin,stdout,time,memory,status,compiler_options,command_line_arguments&base64_encoded=true",
            type: "GET",
            success: function(data, textStatus, jqXHR) {
                sourceEditor.setValue(decode(data["source_code"]));
                $selectLanguage.dropdown("set selected", data["language_id"]);
                $compilerOptions.val(data["compiler_options"]);
                $commandLineArguments.val(data["command_line_arguments"]);
                stdoutEditor.setValue(decode(data["stdout"]));
                var time = (data.time === null ? "-" : data.time + "s");
                var memory = (data.memory === null ? "-" : data.memory + "KB");
                $statusLine.html(`${data.status.description}, ${time}, ${memory}`);
                changeEditorLanguage();
            },
            error: handleRunError
        });
    } else {
        loadRandomLanguage();
    }
}

function run() {
    if (sourceEditor.getValue().trim() === "") {
        alert("lütfen boş bırakmayınız !");
        return;
    } else {
        $runBtn.addClass("loading");
    }

    document.getElementById("stdout-dot").hidden = true;

    stdoutEditor.setValue("");

    var sourceValue = encode(sourceEditor.getValue());
    var languageId = resolveLanguageId($selectLanguage.val());

    if (parseInt(languageId) === 44) {
        sourceValue = sourceEditor.getValue();
    }

    var data = {
        source_code: sourceValue,
        language_id: languageId,
        redirect_stderr_to_stdout: redirectStderrToStdout
    };

    var sendRequest = function(data) {
        timeStart = performance.now();
        $.ajax({
            url: apiUrl + `/submissions?base64_encoded=true&wait=${wait}`,
            type: "POST",
            async: true,
            contentType: "application/json",
            data: JSON.stringify(data),
            xhrFields: {
                withCredentials: apiUrl.indexOf("/secure") != -1 ? true : false
            },
            success: function (data, textStatus, jqXHR) {
                // console.log(`Your submission token is: ${data.token}`);
                if (wait == true) {
                    handleResult(data);
                } else {
                    setTimeout(fetchSubmission.bind(null, data.token), check_timeout);
                }
            },
            error: handleRunError
        });
    }

    var fetchAdditionalFiles = false;
    if (parseInt(languageId) === 82) {
        if (sqliteAdditionalFiles === "") {
            fetchAdditionalFiles = true;
            $.ajax({
                url: `https://minio.judge0.com/public/ide/sqliteAdditionalFiles.base64.txt?${Date.now()}`,
                type: "GET",
                async: true,
                contentType: "text/plain",
                success: function (responseData, textStatus, jqXHR) {
                    sqliteAdditionalFiles = responseData;
                    data["additional_files"] = sqliteAdditionalFiles;
                    sendRequest(data);
                },
                error: handleRunError
            });
        }
        else {
            data["additional_files"] = sqliteAdditionalFiles;
        }
    }

    if (!fetchAdditionalFiles) {
        sendRequest(data);
    }
}

function fetchSubmission(submission_token) {
    $.ajax({
        url: apiUrl + "/submissions/" + submission_token + "?base64_encoded=true",
        type: "GET",
        async: true,
        success: function (data, textStatus, jqXHR) {
            if (data.status.id <= 2) { // In Queue or Processing
                setTimeout(fetchSubmission.bind(null, submission_token), check_timeout);
                return;
            }
            handleResult(data);
        },
        error: handleRunError
    });
}

function changeEditorLanguage() {
    monaco.editor.setModelLanguage(sourceEditor.getModel(), $selectLanguage.find(":selected").attr("mode"));
    currentLanguageId = parseInt($selectLanguage.val());
    $(".lm_title")[0].innerText = fileNames[currentLanguageId];
    apiUrl = resolveApiUrl($selectLanguage.val());
}

function insertTemplate() {
    currentLanguageId = parseInt($selectLanguage.val());
    sourceEditor.setValue(sources[currentLanguageId]);
    changeEditorLanguage();
}

function loadRandomLanguage() {
    var values = [];
    for (var i = 0; i < $selectLanguage[0].options.length; ++i) {
        values.push($selectLanguage[0].options[i].value);
    }
    $selectLanguage.dropdown("set selected", values[9]);
    apiUrl = resolveApiUrl($selectLanguage.val());
    insertTemplate();
}

function resizeEditor(layoutInfo) {
    if (editorMode != "normal") {
        var statusLineHeight = $("#editor-status-line").height();
        layoutInfo.height -= statusLineHeight;
        layoutInfo.contentHeight -= statusLineHeight;
    }
}

function disposeEditorModeObject() {
    try {
        editorModeObject.dispose();
        editorModeObject = null;
    } catch(ignorable) {
    }
}


function resolveLanguageId(id) {
    id = parseInt(id);
    return languageIdTable[id] || id;
}

function resolveApiUrl(id) {
    id = parseInt(id);
    return languageApiUrlTable[id] || defaultUrl;
}

function editorsUpdateFontSize(fontSize) {
    sourceEditor.updateOptions({fontSize: fontSize});
    stdoutEditor.updateOptions({fontSize: fontSize});
}




$(document).ready(function () {
    $selectLanguage = $("#select-language");
    $selectLanguage.change(function (e) {
        if (!isEditorDirty) {
            insertTemplate();
        } else {
            changeEditorLanguage();
        }
    });


    $runBtn = $("#run-btn");
    $runBtn.click(function (e) {
        run();
    });

  





    require(["vs/editor/editor.main", "monaco-vim", "monaco-emacs"], function (ignorable, MVim, MEmacs) {
        layout = new GoldenLayout(layoutConfig, $("#site-content"));

        MonacoVim = MVim;
        MonacoEmacs = MEmacs;

        layout.registerComponent("source", function (container, state) {
            sourceEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                theme: "vs-dark",
                scrollBeyondLastLine: true,
                readOnly: state.readOnly,
                language: "cpp",
                minimap: {
                    enabled: false
                }
            });


            sourceEditor.getModel().onDidChangeContent(function (e) {
                currentLanguageId = parseInt($selectLanguage.val());
                isEditorDirty = sourceEditor.getValue() != sources[currentLanguageId];
            });

            sourceEditor.onDidLayoutChange(resizeEditor);
        });

        layout.registerComponent("stdin", function (container, state) {
            stdinEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                theme: "vs-dark",
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext",
                minimap: {
                    enabled: false
                }
            });
        });

        layout.registerComponent("stdout", function (container, state) {
            stdoutEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                theme: "vs-dark",
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext",
                minimap: {
                    enabled: false
                }
            });

            container.on("tab", function(tab) {
                tab.element.append("<span id=\"stdout-dot\" class=\"dot\" hidden></span>");
                tab.element.on("mousedown", function(e) {
                    e.target.closest(".lm_tab").children[3].hidden = true;
                });
            });
        });

        layout.registerComponent("stderr", function (container, state) {
            stderrEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                theme: "vs-dark",
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext",
                minimap: {
                    enabled: false
                }
            });

         
        });

        layout.registerComponent("compile output", function (container, state) {
            compileOutputEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                theme: "vs-dark",
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext",
                minimap: {
                    enabled: false
                }
            });

            container.on("tab", function(tab) {
                tab.element.append("<span id=\"compile-output-dot\" class=\"dot\" hidden></span>");
                tab.element.on("mousedown", function(e) {
                    e.target.closest(".lm_tab").children[3].hidden = true;
                });
            });
        });

        layout.registerComponent("sandbox message", function (container, state) {
            sandboxMessageEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                theme: "vs-dark",
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext",
                minimap: {
                    enabled: false
                }
            });

            container.on("tab", function(tab) {
                tab.element.append("<span id=\"sandbox-message-dot\" class=\"dot\" hidden></span>");
                tab.element.on("mousedown", function(e) {
                    e.target.closest(".lm_tab").children[3].hidden = true;
                });
            });
        });

        

        layout.init();
    });
});





var cSource = "\
// Powered by Judge0\n\
#include <stdio.h>\n\
\n\
int main(void) {\n\
    printf(\"Hello Judge0!\\n\");\n\
    return 0;\n\
}\n\
";

var csharpSource = "\
public class Hello {\n\
    public static void Main() {\n\
        System.Console.WriteLine(\"hello, world\");\n\
    }\n\
}\n\
";

var cppSource = "\
#include <iostream>\n\
\n\
int main() {\n\
    std::cout << \"hello, world\" << std::endl;\n\
    return 0;\n\
}\n\
";
var javaSource = "\
public class Main {\n\
    public static void main(String[] args) {\n\
        System.out.println(\"hello, world\");\n\
    }\n\
}\n\
";
var objectiveCSource = "\
#import <Foundation/Foundation.h>\n\
\n\
int main() {\n\
    @autoreleasepool {\n\
        char name[10];\n\
        scanf(\"%s\", name);\n\
        NSString *message = [NSString stringWithFormat:@\"hello, %s\\n\", name];\n\
        printf(\"%s\", message.UTF8String);\n\
    }\n\
    return 0;\n\
}\n\
";


var pythonSource = "print(\"hello, world\")";


var c3Source = "\
// On the Judge0 IDE, C3 is automatically\n\
// updated every hour to the latest commit on master branch.\n\
module main;\n\
\n\
extern func void printf(char *str, ...);\n\
\n\
func int main()\n\
{\n\
    printf(\"hello, world\\n\");\n\
    return 0;\n\
}\n\
";

var mpiccSource = "\
// Try adding \"-n 5\" (without quotes) into command line arguments. \n\
#include <mpi.h>\n\
\n\
#include <stdio.h>\n\
\n\
int main()\n\
{\n\
    MPI_Init(NULL, NULL);\n\
\n\
    int world_size;\n\
    MPI_Comm_size(MPI_COMM_WORLD, &world_size);\n\
\n\
    int world_rank;\n\
    MPI_Comm_rank(MPI_COMM_WORLD, &world_rank);\n\
\n\
    printf(\"Hello from processor with rank %d out of %d processors.\\n\", world_rank, world_size);\n\
\n\
    MPI_Finalize();\n\
\n\
    return 0;\n\
}\n\
";

var mpicxxSource = "\
// Try adding \"-n 5\" (without quotes) into command line arguments. \n\
#include <mpi.h>\n\
\n\
#include <iostream>\n\
\n\
int main()\n\
{\n\
    MPI_Init(NULL, NULL);\n\
\n\
    int world_size;\n\
    MPI_Comm_size(MPI_COMM_WORLD, &world_size);\n\
\n\
    int world_rank;\n\
    MPI_Comm_rank(MPI_COMM_WORLD, &world_rank);\n\
\n\
    std::cout << \"Hello from processor with rank \"\n\
              << world_rank << \" out of \" << world_size << \" processors.\\n\";\n\
\n\
    MPI_Finalize();\n\
\n\
    return 0;\n\
}\n\
";

var mpipySource = "\
# Try adding \"-n 5\" (without quotes) into command line arguments. \n\
from mpi4py import MPI\n\
\n\
comm = MPI.COMM_WORLD\n\
world_size = comm.Get_size()\n\
world_rank = comm.Get_rank()\n\
\n\
print(f\"Hello from processor with rank {world_rank} out of {world_size} processors\")\n\
";

var nimSource = "\
# On the Judge0 IDE, Nim is automatically\n\
# updated every day to the latest stable version.\n\
echo \"hello, world\"\n\
";

var pythonForMlSource = "\
import mlxtend\n\
import numpy\n\
import pandas\n\
import scipy\n\
import sklearn\n\
\n\
print(\"hello, world\")\n\
";


var cppTestSource = "\
#include <gtest/gtest.h>\n\
\n\
int add(int x, int y) {\n\
    return x + y;\n\
}\n\
\n\
TEST(AdditionTest, NeutralElement) {\n\
    EXPECT_EQ(1, add(1, 0));\n\
    EXPECT_EQ(1, add(0, 1));\n\
    EXPECT_EQ(0, add(0, 0));\n\
}\n\
\n\
TEST(AdditionTest, CommutativeProperty) {\n\
    EXPECT_EQ(add(2, 3), add(3, 2));\n\
}\n\
\n\
int main(int argc, char **argv) {\n\
    ::testing::InitGoogleTest(&argc, argv);\n\
    return RUN_ALL_TESTS();\n\
}\n\
";

var csharpTestSource ="\
using NUnit.Framework;\n\
\n\
public class Calculator\n\
{\n\
    public int add(int a, int b)\n\
    {\n\
        return a + b;\n\
    }\n\
}\n\
\n\
[TestFixture]\n\
public class Tests\n\
{\n\
    private Calculator calculator;\n\
\n\
    [SetUp]\n\
    protected void SetUp()\n\
    {\n\
        calculator = new Calculator();\n\
    }\n\
\n\
    [Test]\n\
    public void NeutralElement()\n\
    {\n\
        Assert.AreEqual(1, calculator.add(1, 0));\n\
        Assert.AreEqual(1, calculator.add(0, 1));\n\
        Assert.AreEqual(0, calculator.add(0, 0));\n\
    }\n\
\n\
    [Test]\n\
    public void CommutativeProperty()\n\
    {\n\
        Assert.AreEqual(calculator.add(2, 3), calculator.add(3, 2));\n\
    }\n\
}\n\
";

var sources = {
    48: cSource,
    49: cSource,
    50: cSource,
    51: csharpSource,
    52: cppSource,
    53: cppSource,
    54: cppSource,
    70: pythonSource,
    71: pythonSource,
    75: cSource,
    76: cppSource,
    79: objectiveCSource,
    1001: cSource,
    1002: cppSource,
    1003: c3Source,
    1004: javaSource,
    1006: mpiccSource,
    1007: mpicxxSource,
    1008: mpipySource,
    1009: nimSource,
    1010: pythonForMlSource,
    1012: cppTestSource,
    1013: cSource,
    1014: cppSource,
    1015: cppTestSource,
    1021: csharpSource,
    1022: csharpSource,
    1023: csharpTestSource,
};

var fileNames = {
    45: "main.asm",
    46: "script.sh",
    47: "main.bas",
    48: "main.c",
    49: "main.c",
    50: "main.c",
    51: "Main.cs",
    52: "main.cpp",
    53: "main.cpp",
    54: "main.cpp",
    55: "script.lisp",
    56: "main.d",
    57: "script.exs",
    58: "main.erl",
    44: "a.out",
    59: "main.f90",
    60: "main.go",
    61: "main.hs",
    62: "Main.java",
    63: "script.js",
    64: "script.lua",
    65: "main.ml",
    66: "script.m",
    67: "main.pas",
    68: "script.php",
    43: "text.txt",
    69: "main.pro",
    70: "script.py",
    71: "script.py",
    72: "script.rb",
    73: "main.rs",
    74: "script.ts",
    75: "main.c",
    76: "main.cpp",
    77: "main.cob",
    78: "Main.kt",
    79: "main.m",
    80: "script.r",
    81: "Main.scala",
    82: "script.sql",
    83: "Main.swift",
    84: "Main.vb",
    85: "script.pl",
    86: "main.clj",
    87: "script.fsx",
    88: "script.groovy",
    1001: "main.c",
    1002: "main.cpp",
    1003: "main.c3",
    1004: "Main.java",
    1005: "MainTest.java",
    1006: "main.c",
    1007: "main.cpp",
    1008: "script.py",
    1009: "main.nim",
    1010: "script.py",
    1011: "main.bsq",
    1012: "main.cpp",
    1013: "main.c",
    1014: "main.cpp",
    1015: "main.cpp",
    1021: "Main.cs",
    1022: "Main.cs",
    1023: "Test.cs",
    1024: "script.fsx"
};

var languageIdTable = {
    1001: 1,
    1002: 2,
    1003: 3,
    1004: 4,
    1005: 5,
    1006: 6,
    1007: 7,
    1008: 8,
    1009: 9,
    1010: 10,
    1011: 11,
    1012: 12,
    1013: 13,
    1014: 14,
    1015: 15,
    1021: 21,
    1022: 22,
    1023: 23,
    1024: 24
}

var extraApiUrl = "https://extra-ce.judge0.com";
var languageApiUrlTable = {
    1001: extraApiUrl,
    1002: extraApiUrl,
    1003: extraApiUrl,
    1004: extraApiUrl,
    1005: extraApiUrl,
    1006: extraApiUrl,
    1007: extraApiUrl,
    1008: extraApiUrl,
    1009: extraApiUrl,
    1010: extraApiUrl,
    1011: extraApiUrl,
    1012: extraApiUrl,
    1013: extraApiUrl,
    1014: extraApiUrl,
    1015: extraApiUrl,
    1021: extraApiUrl,
    1022: extraApiUrl,
    1023: extraApiUrl,
    1024: extraApiUrl
}
